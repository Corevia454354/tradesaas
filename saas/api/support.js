import { db } from './_lib/firebase.js';
import { HttpError, handle, readBody } from './_lib/http.js';
import { valid, loadMembers, ctx, getDoc } from './_lib/biz.js';
import { supportAgents, ticketVisibleTo } from './_lib/access.js';
import * as V from './_lib/biz-validate.js';

// POST /api/support { action, ... }   Customer support inbox (Business plan).
// Public (no sign-in):  info, submit      <- the business's public support form (support.html)
// Staff (owner + chosen support agents):  claim, assign, note, reply, setStatus, setAgents
// The browser only READS tickets (firestore.rules); every change is made here.

const FEATURE = 'support';
const PER_HOUR = 40; // inquiries one business can receive per hour through the public form (spam brake)
const hourKey = (now) => new Date(now + 2 * 36e5).toISOString().slice(0, 13);

async function publicTenant(tid) {
  if (typeof tid !== 'string' || !tid || tid.includes('/')) throw new HttpError(404, 'This support page was not found.');
  const ref = db.collection('tenants').doc(tid);
  const snap = await ref.get();
  const t = snap.data();
  if (!snap.exists || !['active', 'past_due'].includes(t.status) || !t.entitlements?.features?.includes(FEATURE)) {
    throw new HttpError(404, 'This support page is not available.');
  }
  return { ref, tenant: t };
}

async function agentCtx(request) {
  const c = await ctx(request, FEATURE);
  const agents = await supportAgents(c.ref);
  if (!c.isOwner && !agents.includes(c.uid)) throw new HttpError(403, 'You have not been set up to handle customer support. Ask the owner.');
  return { ...c, agents };
}
const addToThread = (t, entry) => [...(t.thread || []), entry].slice(-200);

const ACTIONS = {
  // ---------------------------------------------------------------- public
  async info(request, args) {
    const { tenant } = await publicTenant(args.tid);
    return { name: tenant.branding?.displayName || tenant.name, whiteLabel: !!tenant.entitlements?.features?.includes('whiteLabel') };
  },

  async submit(request, args) {
    if (args.hp) return { ok: true }; // honeypot field: real people leave it empty, bots fill it in
    const { ref, tenant } = await publicTenant(args.tid);
    const d = valid(V.sanitizeInquiry, args);
    const members = await loadMembers(ref);
    const agents = (await supportAgents(ref)).filter((u) => members.get(u) && members.get(u).status !== 'inactive');
    const visibleTo = ticketVisibleTo(members, agents);
    const now = Date.now();
    const meter = ref.collection('usage').doc('support');
    const ticketRef = ref.collection('tickets').doc();
    let number = 0;
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(meter)).data() || {};
      const hk = hourKey(now);
      const inHour = s.hour === hk ? s.hourCount || 0 : 0;
      if (inHour >= PER_HOUR) throw new HttpError(429, 'We are receiving a lot of messages right now. Please try again later.');
      number = (s.count || 0) + 1;
      tx.set(meter, { count: number, hour: hk, hourCount: inHour + 1 }, { merge: true });
      tx.create(ticketRef, {
        number, name: d.name, email: d.email, phone: d.phone, subject: d.subject, status: 'open', assigneeId: null, assigneeName: null,
        thread: [{ type: 'customer', name: d.name, text: d.message, at: now }], visibleTo, createdAt: now, updatedAt: now, lastAt: now,
      });
    });
    return { ok: true, number, business: tenant.name };
  },

  // ---------------------------------------------------------------- staff
  async setAgents(request, args) {
    const c = await ctx(request, FEATURE);
    if (!c.isOwner) throw new HttpError(403, 'Only the business owner can choose who handles support.');
    const members = await loadMembers(c.ref);
    const uids = valid(V.sanitizeAgents, args).filter((u) => members.get(u) && members.get(u).status !== 'inactive' && members.get(u).role !== 'owner');
    await c.ref.collection('settings').doc('support').set({ agents: uids, updatedAt: Date.now() }, { merge: true });
    const visibleTo = ticketVisibleTo(members, uids);
    const snap = await c.ref.collection('tickets').get();
    const batch = db.batch();
    for (const d of snap.docs) {
      const keep = d.data().assigneeId && !uids.includes(d.data().assigneeId) ? { assigneeId: null, assigneeName: null } : {};
      batch.update(d.ref, { visibleTo, ...keep });
    }
    await batch.commit();
    return { ok: true, agents: uids };
  },

  async claim(request, args) {
    const c = await agentCtx(request);
    const t = await getDoc(c.ref, 'tickets', args.id, 'Inquiry');
    await t.ref.update({ assigneeId: c.uid, assigneeName: c.me.name, updatedAt: Date.now() });
    return { ok: true };
  },

  async assign(request, args) {
    const c = await agentCtx(request);
    const t = await getDoc(c.ref, 'tickets', args.id, 'Inquiry');
    if (args.uid === null || args.uid === '') { await t.ref.update({ assigneeId: null, assigneeName: null, updatedAt: Date.now() }); return { ok: true }; }
    const members = await loadMembers(c.ref);
    const m = members.get(args.uid);
    if (!m || m.status === 'inactive' || !(m.role === 'owner' || c.agents.includes(m.uid))) throw new HttpError(400, 'You can only give an inquiry to the owner or a support agent.');
    await t.ref.update({ assigneeId: m.uid, assigneeName: m.name, updatedAt: Date.now() });
    return { ok: true };
  },

  /** Internal note: only staff on the inbox see it. */
  async note(request, args) {
    const c = await agentCtx(request);
    const t = await getDoc(c.ref, 'tickets', args.id, 'Inquiry');
    const text = valid(V.sanitizeText, args.text, 'Note', 2000);
    const now = Date.now();
    await t.ref.update({ thread: addToThread(t, { type: 'note', by: c.uid, name: c.me.name, text, at: now }), updatedAt: now });
    return { ok: true };
  },

  /** Record the reply that was sent to the customer (via Gmail, or any other way) so everyone can see it. */
  async reply(request, args) {
    const c = await agentCtx(request);
    const t = await getDoc(c.ref, 'tickets', args.id, 'Inquiry');
    const text = valid(V.sanitizeText, args.text, 'Reply');
    const via = args.via === 'gmail' ? 'gmail' : 'other';
    const now = Date.now();
    const upd = { thread: addToThread(t, { type: 'reply', by: c.uid, name: c.me.name, text, via, at: now }), status: 'pending', updatedAt: now, lastAt: now };
    if (!t.assigneeId) { upd.assigneeId = c.uid; upd.assigneeName = c.me.name; }
    if (!t.firstReplyAt) upd.firstReplyAt = now;
    await t.ref.update(upd);
    return { ok: true };
  },

  async setStatus(request, args) {
    const c = await agentCtx(request);
    const t = await getDoc(c.ref, 'tickets', args.id, 'Inquiry');
    const status = valid(V.sanitizeStatus, args.status);
    await t.ref.update({ status, updatedAt: Date.now(), ...(status === 'closed' ? { closedAt: Date.now() } : {}) });
    return { ok: true };
  },
};

export const POST = handle(async (request) => {
  const args = await readBody(request);
  const fn = Object.hasOwn(ACTIONS, args.action) ? ACTIONS[args.action] : null;
  if (!fn) throw new HttpError(400, 'Unknown action.');
  return fn(request, args);
});
