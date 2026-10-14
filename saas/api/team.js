import { auth, db } from './_lib/firebase.js';
import { HttpError, handle, readBody } from './_lib/http.js';
import { refreshAccess } from './_lib/access.js';
import { valid, loadMembers, ctx, ownerOnly, managerOnly, live, canActFor, getDoc, requireJob, commitInChunks } from './_lib/biz.js';
import { ValidationError } from './_lib/validate.js';
import * as V from './_lib/team-validate.js';
import {
  ROLE_LABEL, isManagerRole, canReportTo, descendants, ancestorsFor, visibleFor, workingDays, dateKeyDiffDays,
  leaveUsed, DEFAULT_ALLOWANCE, hoursFromMs, MAX_TIMER_HOURS, payslipTotals,
} from '../public/shared/team.js';
import { dateKeySAST } from '../public/lib.js';

// POST /api/team { action, ... }   The Business tier. Every write in the team features goes through here, so
// who-can-see-what (visibleTo) and who-may-do-what are decided on the server and cannot be forged.
// The browser only READS these collections (firestore.rules).

const DAY = 864e5;

/** After someone moves in the hierarchy, refresh who can see their existing records. */
async function rebuildVisibility(ref, members, uids) {
  const ops = [];
  for (const uid of uids) {
    for (const [col, fields] of [['tasks', ['assigneeId', 'createdBy']], ['timeEntries', ['uid']], ['leave', ['uid']], ['expenses', ['uid']]]) {
      for (const field of fields) {
        const snap = await ref.collection(col).where(field, '==', uid).get();
        for (const d of snap.docs) {
          const data = d.data();
          const visibleTo = col === 'tasks' ? visibleFor(members, data.assigneeId, data.createdBy) : visibleFor(members, data.uid);
          const upd = { visibleTo };
          if (col === 'leave' && data.status === 'pending') upd.approvers = members.get(data.uid)?.ancestors || [];
          ops.push((b) => b.update(d.ref, upd));
        }
      }
    }
  }
  await commitInChunks(ops);
}

const ACTIONS = {
  // ------------------------------------------------------------------ team
  async hello(request) {
    const c = await ctx(request, 'hierarchy');
    return { ok: true, role: c.me.role };
  },

  async invite(request, args) {
    const c = await ctx(request, 'hierarchy');
    ownerOnly(c);
    const inv = valid(V.sanitizeInvite, args.data);
    const members = await loadMembers(c.ref);

    const seats = c.tenant.entitlements.limits.seats;
    const used = [...members.values()].filter((m) => m.status !== 'inactive').length;
    if (seats !== -1 && used >= seats) {
      throw new HttpError(403, `Your plan includes ${seats} people and you have ${used}. Contact us to add more seats.`);
    }

    const parent = inv.managerId ? members.get(inv.managerId) : members.get(c.uid);
    if (!parent || parent.status === 'inactive') throw new HttpError(400, 'That manager was not found.');
    if (!canReportTo(inv.role, parent.role)) {
      throw new HttpError(400, `A ${ROLE_LABEL[inv.role].toLowerCase()} cannot report to a ${ROLE_LABEL[parent.role].toLowerCase()}.`);
    }

    let user = await auth.getUserByEmail(inv.email).catch(() => null);
    if (user) {
      if (members.has(user.uid)) throw new HttpError(409, 'This person is already in your team.');
      if (user.customClaims?.tenantId && user.customClaims.tenantId !== c.tenantId) {
        throw new HttpError(409, 'This email already belongs to another business.');
      }
    } else {
      user = await auth.createUser({ email: inv.email, displayName: inv.name });
    }

    const now = Date.now();
    await c.ref.collection('members').doc(user.uid).set({
      uid: user.uid, email: inv.email, name: inv.name, phone: inv.phone, role: inv.role, department: inv.department,
      managerId: parent.uid, ancestors: ancestorsFor(parent), status: 'invited', createdAt: now,
    });
    await c.ref.collection('private').doc(user.uid).set({ hourlyRate: inv.hourlyRate });
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), tenantId: c.tenantId, role: inv.role });

    // A sign-in link the owner can send by WhatsApp. (The app also asks Firebase to email it.)
    let link = null;
    try {
      const base = String(process.env.APP_URL || '').replace(/\/$/, '');
      link = await auth.generatePasswordResetLink(inv.email, base ? { url: base } : undefined);
    } catch (e) { console.error('reset link failed', e?.message); }
    await refreshAccess(c.ref);
    return { uid: user.uid, link };
  },

  async updateMember(request, args) {
    const c = await ctx(request, 'hierarchy');
    ownerOnly(c);
    const u = valid(V.sanitizeMemberUpdate, args.data);
    const members = await loadMembers(c.ref);
    const target = members.get(u.uid);
    if (!target) throw new HttpError(404, 'Person not found.');
    const isOwnerTarget = target.role === 'owner';
    if (isOwnerTarget && (u.role || u.managerId || u.status)) throw new HttpError(400, 'The owner cannot be moved or switched off.');

    const set = {};
    for (const k of ['name', 'phone', 'department']) if (u[k] !== undefined) set[k] = u[k];

    const newRole = u.role ?? target.role;
    const structural = !isOwnerTarget && (u.role !== undefined || u.managerId !== undefined);
    const subtree = descendants([...members.values()], target.uid).filter((m) => m.status !== 'inactive');
    const ops = [];

    if (structural) {
      const parent = members.get(u.managerId ?? target.managerId);
      if (!parent || parent.status === 'inactive') throw new HttpError(400, 'That manager was not found.');
      if (parent.uid === target.uid || (parent.ancestors || []).includes(target.uid)) throw new HttpError(400, 'A person cannot report to someone in their own team.');
      if (!canReportTo(newRole, parent.role)) throw new HttpError(400, `A ${ROLE_LABEL[newRole].toLowerCase()} cannot report to a ${ROLE_LABEL[parent.role].toLowerCase()}.`);
      for (const child of subtree.filter((m) => m.managerId === target.uid)) {
        if (!canReportTo(child.role, newRole)) throw new HttpError(400, `${child.name} reports to this person and would no longer fit. Move them first.`);
      }
      set.role = newRole; set.managerId = parent.uid;
      const newAnc = ancestorsFor(parent);
      set.ancestors = newAnc;
      const oldPrefix = (target.ancestors || []).length;
      for (const d of subtree) {
        const idx = d.ancestors.indexOf(target.uid);
        const anc = [...newAnc, ...d.ancestors.slice(idx)];
        d.ancestors = anc;
        ops.push((b) => b.update(c.ref.collection('members').doc(d.uid), { ancestors: anc }));
      }
      void oldPrefix;
    }

    if (u.status && u.status !== target.status && !(u.status === 'active' && target.status === 'invited')) {
      if (u.status === 'inactive') {
        if (subtree.length) throw new HttpError(400, 'This person still has people reporting to them. Move their team first.');
        set.status = 'inactive';
      } else {
        const seats = c.tenant.entitlements.limits.seats;
        const used = [...members.values()].filter((m) => m.status !== 'inactive').length;
        if (seats !== -1 && used >= seats) throw new HttpError(403, `Your plan includes ${seats} people. Contact us to add more seats.`);
        set.status = 'active';
      }
    }

    if (Object.keys(set).length) ops.push((b) => b.update(c.ref.collection('members').doc(target.uid), set));
    if (u.hourlyRate !== undefined) ops.push((b) => b.set(c.ref.collection('private').doc(target.uid), { hourlyRate: u.hourlyRate }, { merge: true }));
    await commitInChunks(ops);

    // Claims: role changes, and switching someone off removes their access to the business.
    const user = await auth.getUser(target.uid);
    const claims = { ...(user.customClaims ?? {}) };
    let touched = false;
    if (set.status === 'inactive') { delete claims.tenantId; delete claims.role; touched = true; }
    else if (set.status === 'active' || set.role) { claims.tenantId = c.tenantId; claims.role = set.role ?? target.role; touched = true; }
    if (touched) { await auth.setCustomUserClaims(target.uid, claims); if (set.status === 'inactive') await auth.revokeRefreshTokens(target.uid); }

    if (structural) {
      const fresh = await loadMembers(c.ref);
      await rebuildVisibility(c.ref, fresh, [target.uid, ...subtree.map((m) => m.uid)]);
    }
    await refreshAccess(c.ref); // library + support lists depend on roles and who is switched on
    return { ok: true };
  },

  // ------------------------------------------------------------------ tasks
  async createTask(request, args) {
    const c = await ctx(request, 'tasks');
    const d = valid(V.sanitizeTask, args.data);
    const members = await loadMembers(c.ref);
    const assignee = live(members, d.assigneeId, 'assignee');
    if (!canActFor(c, assignee)) throw new HttpError(403, 'You can give tasks to yourself or to people in your team.');
    await requireJob(c.ref, d.jobId);
    const now = Date.now();
    const ref = c.ref.collection('tasks').doc();
    await ref.create({
      ...d, status: 'todo', assigneeName: assignee.name, createdBy: c.uid, createdByName: c.me.name, comments: [],
      visibleTo: visibleFor(members, assignee.uid, c.uid), createdAt: now, updatedAt: now,
    });
    return { id: ref.id };
  },

  async updateTask(request, args) {
    const c = await ctx(request, 'tasks');
    const task = await getDoc(c.ref, 'tasks', args.id, 'Task');
    const members = await loadMembers(c.ref);
    const assigneeM = members.get(task.assigneeId);
    const isAssignee = task.assigneeId === c.uid;
    const isBoss = c.isOwner || task.createdBy === c.uid || (assigneeM?.ancestors || []).includes(c.uid);
    if (!isAssignee && !isBoss) throw new HttpError(403, 'This task is not yours.');

    const upd = { updatedAt: Date.now() };
    const data = valid(V.sanitizeTask, args.data || {}, { partial: true });
    const keys = Object.keys(data);
    if (!isBoss && keys.some((k) => k !== 'status')) throw new HttpError(403, 'You can change the status and add comments. Ask your manager to change other details.');
    Object.assign(upd, data);
    if (data.assigneeId && data.assigneeId !== task.assigneeId) {
      const na = live(members, data.assigneeId, 'assignee');
      if (!canActFor(c, na)) throw new HttpError(403, 'You can give tasks to yourself or to people in your team.');
      upd.assigneeName = na.name;
      upd.visibleTo = visibleFor(members, na.uid, task.createdBy);
    }
    if (data.jobId) await requireJob(c.ref, data.jobId);
    if (data.status) upd.completedAt = data.status === 'done' ? Date.now() : null;
    if (args.comment !== undefined) {
      const text = valid(V.sanitizeComment, args.comment);
      const comments = [...(task.comments || []), { uid: c.uid, name: c.me.name, text, at: Date.now() }].slice(-100);
      upd.comments = comments;
    }
    await task.ref.update(upd);
    return { ok: true };
  },

  async deleteTask(request, args) {
    const c = await ctx(request, 'tasks');
    const task = await getDoc(c.ref, 'tasks', args.id, 'Task');
    const members = await loadMembers(c.ref);
    const isBoss = c.isOwner || task.createdBy === c.uid || (members.get(task.assigneeId)?.ancestors || []).includes(c.uid);
    if (!isBoss) throw new HttpError(403, 'Only the person who set the task, or their managers, can delete it.');
    await task.ref.delete();
    return { ok: true };
  },

  // ------------------------------------------------------------------ work documents
  async createDoc(request, args) {
    const c = await ctx(request, 'workDocs');
    managerOnly(c);
    const d = valid(V.sanitizeDoc, args.data);
    const members = await loadMembers(c.ref);
    const everyone = [...members.values()].filter((m) => m.status !== 'inactive' && m.uid !== c.uid);
    let recipients;
    if (d.audience === 'all') {
      if (!c.isOwner) throw new HttpError(403, 'Only the owner can send to everyone. Choose your team instead.');
      recipients = everyone.map((m) => m.uid);
    } else if (d.audience === 'team') {
      recipients = everyone.filter((m) => canActFor(c, m)).map((m) => m.uid);
    } else {
      recipients = d.audience.uids.filter((u) => u !== c.uid);
      for (const u of recipients) {
        const m = live(members, u);
        if (!canActFor(c, m)) throw new HttpError(403, `You can send documents to your own team only (${m.name} is not in it).`);
      }
    }
    if (!recipients.length) throw new HttpError(400, 'There is nobody to send this to yet.');
    const ref = c.ref.collection('workDocs').doc();
    await ref.create({
      title: d.title, kind: d.kind, body: d.body, link: d.link, requireAck: d.requireAck,
      createdBy: c.uid, createdByName: c.me.name, recipients, acks: {},
      visibleTo: visibleFor(members, c.uid, ...recipients), createdAt: Date.now(),
    });
    return { id: ref.id, recipients: recipients.length };
  },

  async ackDoc(request, args) {
    const c = await ctx(request, 'workDocs');
    const doc = await getDoc(c.ref, 'workDocs', args.id, 'Document');
    if (!(doc.recipients || []).includes(c.uid)) throw new HttpError(403, 'This document was not sent to you.');
    await doc.ref.update({ [`acks.${c.uid}`]: Date.now() });
    return { ok: true };
  },

  async deleteDoc(request, args) {
    const c = await ctx(request, 'workDocs');
    const doc = await getDoc(c.ref, 'workDocs', args.id, 'Document');
    if (!c.isOwner && doc.createdBy !== c.uid) throw new HttpError(403, 'Only the sender or the owner can remove this.');
    await doc.ref.delete();
    return { ok: true };
  },

  // ------------------------------------------------------------------ time
  async startTimer(request, args) {
    const c = await ctx(request, 'timeLeave');
    const open = await c.ref.collection('timeEntries').where('uid', '==', c.uid).where('endedAt', '==', null).get();
    if (!open.empty) throw new HttpError(409, 'Your timer is already running. Stop it first.');
    const jobId = args.jobId ? String(args.jobId) : null;
    await requireJob(c.ref, jobId);
    const members = await loadMembers(c.ref);
    const now = Date.now();
    const ref = c.ref.collection('timeEntries').doc();
    await ref.create({
      uid: c.uid, name: c.me.name, startedAt: now, endedAt: null, hours: 0, jobId, note: String(args.note ?? '').slice(0, 300),
      date: dateKeySAST(now), manual: false, visibleTo: visibleFor(members, c.uid), createdAt: now,
    });
    return { id: ref.id };
  },

  async stopTimer(request, args) {
    const c = await ctx(request, 'timeLeave');
    const e = await getDoc(c.ref, 'timeEntries', args.id, 'Time entry');
    if (e.uid !== c.uid) throw new HttpError(403, 'That is not your timer.');
    if (e.endedAt) throw new HttpError(409, 'That timer has already stopped.');
    const now = Date.now();
    let hours = hoursFromMs(now - e.startedAt);
    const capped = hours > MAX_TIMER_HOURS;
    hours = Math.max(0.01, Math.min(hours, MAX_TIMER_HOURS));
    await e.ref.update({ endedAt: now, hours, capped });
    await writeLabour(c, e.id, { uid: c.uid, jobId: e.jobId, hours });
    return { hours, capped };
  },

  async addTime(request, args) {
    const c = await ctx(request, 'timeLeave');
    const d = valid(V.sanitizeManualTime, args.data);
    const today = dateKeySAST();
    if (d.date > today) throw new HttpError(400, 'You cannot log time in the future.');
    if (dateKeyDiffDays(d.date, today) > 60) throw new HttpError(400, 'You can only log time for the last 60 days.');
    await requireJob(c.ref, d.jobId);
    const members = await loadMembers(c.ref);
    const now = Date.now();
    const ref = c.ref.collection('timeEntries').doc();
    await ref.create({
      uid: c.uid, name: c.me.name, startedAt: null, endedAt: now, hours: d.hours, jobId: d.jobId, note: d.note,
      date: d.date, manual: true, visibleTo: visibleFor(members, c.uid), createdAt: now,
    });
    await writeLabour(c, ref.id, { uid: c.uid, jobId: d.jobId, hours: d.hours });
    return { id: ref.id };
  },

  async deleteTime(request, args) {
    const c = await ctx(request, 'timeLeave');
    const e = await getDoc(c.ref, 'timeEntries', args.id, 'Time entry');
    if (!c.isOwner && (e.uid !== c.uid || Date.now() - e.createdAt > 7 * DAY)) throw new HttpError(403, 'You can delete your own entries for 7 days after you log them.');
    await e.ref.delete();
    await c.ref.collection('labourCosts').doc(e.id).delete();
    return { ok: true };
  },

  // ------------------------------------------------------------------ leave
  async requestLeave(request, args) {
    const c = await ctx(request, 'timeLeave');
    const d = valid(V.sanitizeLeave, args.data);
    const days = workingDays(d.from, d.to);
    if (days < 1) throw new HttpError(400, 'Those dates have no working days (weekends are not counted).');
    if (d.from.slice(0, 4) !== d.to.slice(0, 4)) throw new HttpError(400, 'Please make one request for each calendar year.');
    if (dateKeyDiffDays(d.from, d.to) > 60) throw new HttpError(400, 'A request can cover 60 days at most.');
    const today = dateKeySAST();
    if (dateKeyDiffDays(d.from, today) > 30) throw new HttpError(400, 'Leave can start up to 30 days ago at most.');
    if (dateKeyDiffDays(today, d.to) > 365) throw new HttpError(400, 'That is too far ahead.');

    const mine = (await c.ref.collection('leave').where('uid', '==', c.uid).get()).docs.map((x) => x.data());
    const live_ = mine.filter((r) => ['pending', 'approved'].includes(r.status));
    if (live_.some((r) => d.from <= r.to && d.to >= r.from)) throw new HttpError(409, 'You already have leave on some of those dates.');

    const settings = (await c.ref.collection('settings').doc('team').get()).data() || {};
    const allowance = { ...DEFAULT_ALLOWANCE, ...(settings.leaveAllowance || {}) };
    if (d.type === 'annual' || d.type === 'family') {
      const used = leaveUsed(mine, c.uid, d.from.slice(0, 4), d.type);
      if (used + days > allowance[d.type]) {
        throw new HttpError(400, `You have ${Math.max(0, allowance[d.type] - used)} day(s) of ${d.type === 'annual' ? 'annual' : 'family responsibility'} leave left this year and asked for ${days}.`);
      }
    }
    const members = await loadMembers(c.ref);
    const approvers = c.me.ancestors || [];
    const now = Date.now();
    const ref = c.ref.collection('leave').doc();
    await ref.create({
      uid: c.uid, name: c.me.name, ...d, days, status: approvers.length ? 'pending' : 'approved', approvers,
      ...(approvers.length ? {} : { decidedBy: c.uid, decidedByName: c.me.name, decidedAt: now }),
      visibleTo: visibleFor(members, c.uid), createdAt: now,
    });
    return { id: ref.id, days, status: approvers.length ? 'pending' : 'approved' };
  },

  async decideLeave(request, args) {
    const c = await ctx(request, 'timeLeave');
    const r = await getDoc(c.ref, 'leave', args.id, 'Leave request');
    if (!['approved', 'declined'].includes(args.decision)) throw new HttpError(400, 'Choose approve or decline.');
    if (r.uid === c.uid) throw new HttpError(403, 'You cannot decide your own leave.');
    if (!(r.approvers || []).includes(c.uid)) throw new HttpError(403, 'This request is not yours to decide.');
    if (r.status !== 'pending') throw new HttpError(409, `This request is already ${r.status}.`);
    await r.ref.update({ status: args.decision, decidedBy: c.uid, decidedByName: c.me.name, decidedAt: Date.now(), decisionNote: String(args.note ?? '').slice(0, 300) });
    return { ok: true };
  },

  async cancelLeave(request, args) {
    const c = await ctx(request, 'timeLeave');
    const r = await getDoc(c.ref, 'leave', args.id, 'Leave request');
    if (r.uid !== c.uid) throw new HttpError(403, 'That is not your request.');
    const future = r.from > dateKeySAST();
    if (!(r.status === 'pending' || (r.status === 'approved' && future))) throw new HttpError(409, 'This request can no longer be cancelled.');
    await r.ref.update({ status: 'cancelled', decidedAt: Date.now() });
    return { ok: true };
  },

  // ------------------------------------------------------------------ chat
  async createChat(request, args) {
    const c = await ctx(request, 'teamChat');
    const d = valid(V.sanitizeChat, args.data);
    const members = await loadMembers(c.ref);
    const others = d.memberIds.filter((u) => u !== c.uid);
    if (!others.length) throw new HttpError(400, 'Choose at least one other person.');
    for (const u of others) live(members, u);
    const now = Date.now();
    if (others.length === 1 && !d.name) {
      const id = `dm_${[c.uid, others[0]].sort().join('_')}`;
      const ref = c.ref.collection('chats').doc(id);
      if (!(await ref.get()).exists) await ref.create({ name: '', dm: true, members: [c.uid, others[0]], createdBy: c.uid, lastAt: now, lastMessage: null, createdAt: now });
      return { id };
    }
    if (!d.name) throw new HttpError(400, 'Give the group a name.');
    const ref = c.ref.collection('chats').doc();
    await ref.create({ name: d.name, dm: false, members: [c.uid, ...others], createdBy: c.uid, lastAt: now, lastMessage: null, createdAt: now });
    return { id: ref.id };
  },

  async addChatMembers(request, args) {
    const c = await ctx(request, 'teamChat');
    const chat = await getDoc(c.ref, 'chats', args.chatId, 'Chat');
    if (chat.dm) throw new HttpError(400, 'Create a group to chat with more people.');
    if (chat.createdBy !== c.uid && !c.isOwner) throw new HttpError(403, 'Only the person who made the group can add people.');
    const uids = valid(V.sanitizeChat, { memberIds: args.uids ?? [] }).memberIds;
    const members = await loadMembers(c.ref);
    for (const u of uids) live(members, u);
    await chat.ref.update({ members: [...new Set([...chat.members, ...uids])] });
    return { ok: true };
  },

  async leaveChat(request, args) {
    const c = await ctx(request, 'teamChat');
    const chat = await getDoc(c.ref, 'chats', args.chatId, 'Chat');
    if (chat.dm) throw new HttpError(400, 'You cannot leave a one-to-one chat.');
    if (!chat.members.includes(c.uid)) throw new HttpError(403, 'You are not in this group.');
    await chat.ref.update({ members: chat.members.filter((u) => u !== c.uid) });
    return { ok: true };
  },

  async sendMessage(request, args) {
    const c = await ctx(request, 'teamChat');
    const text = valid(V.sanitizeMessage, args.text);
    const chat = await getDoc(c.ref, 'chats', args.chatId, 'Chat');
    if (!(chat.members || []).includes(c.uid)) throw new HttpError(403, 'You are not in this chat.');
    const now = Date.now();
    await chat.ref.collection('messages').doc().create({ uid: c.uid, name: c.me.name, text, at: now });
    await chat.ref.update({ lastAt: now, lastMessage: { text: text.slice(0, 80), name: c.me.name, at: now } });
    return { ok: true };
  },

  // ------------------------------------------------------------------ payroll (records only)
  async savePayslip(request, args) {
    const c = await ctx(request, 'payroll');
    ownerOnly(c);
    const d = valid(V.sanitizePayslip, args.data);
    const members = await loadMembers(c.ref);
    const emp = live(members, d.employeeId, 'employee');
    const totals = payslipTotals(d.earnings, d.deductions);
    if (totals.net < 0) throw new HttpError(400, 'Deductions are more than earnings.');
    const now = Date.now();
    const body = { ...d, ...totals, employeeName: emp.name, notes: d.notes };
    if (args.id) {
      const ps = await getDoc(c.ref, 'payslips', args.id, 'Payslip');
      if (ps.status !== 'draft') throw new HttpError(409, 'An issued payslip cannot be changed. Issue a corrected one instead.');
      await ps.ref.update({ ...body, updatedAt: now });
      return { id: ps.id };
    }
    const ref = c.ref.collection('payslips').doc();
    await ref.create({ ...body, status: 'draft', visibleTo: [c.uid], createdBy: c.uid, createdAt: now, updatedAt: now });
    return { id: ref.id };
  },

  async issuePayslip(request, args) {
    const c = await ctx(request, 'payroll');
    ownerOnly(c);
    const ps = await getDoc(c.ref, 'payslips', args.id, 'Payslip');
    if (ps.status !== 'draft') throw new HttpError(409, 'This payslip is already issued.');
    await ps.ref.update({ status: 'issued', issuedAt: Date.now(), visibleTo: [...new Set([c.uid, ps.employeeId])] });
    return { ok: true };
  },

  async deletePayslip(request, args) {
    const c = await ctx(request, 'payroll');
    ownerOnly(c);
    const ps = await getDoc(c.ref, 'payslips', args.id, 'Payslip');
    if (ps.status !== 'draft') throw new HttpError(409, 'An issued payslip is a record and cannot be deleted.');
    await ps.ref.delete();
    return { ok: true };
  },

  // ------------------------------------------------------------------ job costing
  async addExpense(request, args) {
    const c = await ctx(request, 'jobCosting');
    const d = valid(V.sanitizeExpense, args.data);
    await requireJob(c.ref, d.jobId);
    const members = await loadMembers(c.ref);
    const ref = c.ref.collection('expenses').doc();
    await ref.create({ ...d, uid: c.uid, name: c.me.name, visibleTo: visibleFor(members, c.uid), createdAt: Date.now() });
    return { id: ref.id };
  },

  async deleteExpense(request, args) {
    const c = await ctx(request, 'jobCosting');
    const e = await getDoc(c.ref, 'expenses', args.id, 'Expense');
    if (!c.isOwner && (e.uid !== c.uid || Date.now() - e.createdAt > 7 * DAY)) throw new HttpError(403, 'You can delete your own expenses for 7 days after adding them.');
    await e.ref.delete();
    return { ok: true };
  },
};

/** Cost of an hour of work is fixed when it is logged, so a later pay rise does not rewrite old jobs. */
async function writeLabour(c, entryId, { uid, jobId, hours }) {
  const rate = (await c.ref.collection('private').doc(uid).get()).data()?.hourlyRate ?? 0;
  await c.ref.collection('labourCosts').doc(entryId).set({ uid, jobId: jobId ?? null, hours, rate, cost: Math.round(hours * rate * 100) / 100, at: Date.now() });
}

export const POST = handle(async (request) => {
  const args = await readBody(request);
  const fn = Object.hasOwn(ACTIONS, args.action) ? ACTIONS[args.action] : null;
  if (!fn) throw new HttpError(400, 'Unknown action.');
  return fn(request, args);
});
