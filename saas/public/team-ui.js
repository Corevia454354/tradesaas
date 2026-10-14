// Business tier screens: team, tasks, documents, time, leave, chat, payroll, job costing, reports.
// app.js passes in its helpers (ctx) so this file stays free of Firebase details. Every change goes
// through POST /api/team (the server decides who may do what); the screens only read live data.
import * as T from './shared/team.js';
import { createBizUI } from './biz-ui.js';
import { createCalendarUI } from './calendar-ui.js';
import { icon, avatar, kpi, greeting } from './ui.js';

export function createTeamUI(ctx) {
  const { S, D, L, esc, zar, fld, badge, toast, nav, has, render } = ctx;
  const call = (action, extra = {}) => D.api('/api/team', { action, ...extra });

  // ---------------------------------------------------------------- who is who
  const uid = () => S.user?.uid;
  const members = () => S.members || [];
  const mem = (id) => members().find((m) => m.uid === id);
  const me = () => mem(uid()) || { uid: uid(), name: S.user?.email, role: S.role, ancestors: [] };
  const isOwner = () => S.role === 'owner';
  const isMgr = () => T.isManagerRole(S.role);
  const nameOf = (id) => mem(id)?.name || '—';
  const active = () => members().filter((m) => m.status !== 'inactive');
  const myTeam = () => active().filter((m) => isOwner() || (m.ancestors || []).includes(uid()));
  const assignable = () => [me(), ...myTeam().filter((m) => m.uid !== uid())];
  const today = () => L.dateKeySAST();
  const fmtDay = (key) => (key ? L.fmtDate(Date.parse(key + 'T12:00:00Z')) : '');
  const hrs = (n) => `${Math.round((n || 0) * 100) / 100} h`;
  const people = (list, val) => [['', 'Choose…'], ...list.map((m) => [m.uid, `${m.name} (${T.ROLE_LABEL[m.role] || m.role})`])];
  const jobOptions = (empty = 'No job') => [['', empty], ...S.jobs.map((j) => [j.id, j.title])];
  const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;
  const head = (title, right = '', sub = '') => `<div class="ph"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="ph-act">${right}</div></div>`;
  const av = (id, size = 'sm') => avatar(mem(id) || { name: nameOf(id) }, size);
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const back = (href, label = 'Back') => `<div class="head"><a href="${href}" class="link">← ${esc(label)}</a></div>`;
  const wa = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
  const weekStart = () => { const d = new Date(Date.parse(today() + 'T12:00:00Z')); const k = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - k * 864e5).toISOString().slice(0, 10); };
  const daysAgoKey = (n) => new Date(Date.parse(today() + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);

  const BIZ = createBizUI(ctx, { uid, mem, isOwner, active, today, fmtDay, empty, head, back, byNewest, wa, av });
  const CAL = createCalendarUI(ctx, { uid, mem, isOwner, active, empty, back, av: avatar });

  // ---------------------------------------------------------------- navigation
  function navItems() {
    const core = [['dashboard', 'Home'], ['clients', 'Clients'], ['quotes', 'Quotes'], ['jobs', 'Jobs'], ['certificates', 'Certificates'], ['invoices', 'Invoices']];
    const tail = [['billing', 'Plan'], ['settings', 'Settings']];
    if (!has('hierarchy')) return S.role === 'employee' ? [['dashboard', 'Home']] : [...core, ...tail];
    if (S.role === 'employee') {
      return [['dashboard', 'Home'], ['jobs', 'Jobs'], ['certificates', 'Certificates'], ['tasks', 'Tasks'], ['calendar', 'Calendar'], ['docs', 'Documents'], ...BIZ.navItems(), ['time', 'Time'], ['leave', 'Leave'], ['chat', 'Chat'], ['payroll', 'My pay']];
    }
    return [...core, ['tasks', 'Tasks'], ['calendar', 'Calendar'], ['team', 'Team'], ['docs', 'Documents'], ...BIZ.navItems(), ['time', 'Time'], ['leave', 'Leave'], ['chat', 'Chat'],
      ...(isOwner() ? [['payroll', 'Payroll'], ['costing', 'Costing']] : []), ['reports', 'Reports'], ...(isOwner() ? tail : [])];
  }
  const PAGES = ['tasks', 'team', 'docs', 'time', 'leave', 'chat', 'payroll', 'costing', 'reports'];
  const isTeamPage = (page) => PAGES.includes(page) || BIZ.PAGES.includes(page) || CAL.PAGES.includes(page);

  // ---------------------------------------------------------------- home cards
  const myOpenTasks = () => (S.tasks || []).filter((t) => t.assigneeId === uid() && t.status !== 'done');
  const unreadDocs = () => (S.workDocs || []).filter((d) => (d.recipients || []).includes(uid()) && d.requireAck && !d.acks?.[uid()]);
  const leaveToApprove = () => (S.leave || []).filter((r) => r.status === 'pending' && (r.approvers || []).includes(uid()));
  function homeCards() {
    const myOpen = myOpenTasks();
    const overdue = myOpen.filter((t) => T.taskIsOverdue(t));
    const toApprove = leaveToApprove();
    const unread = unreadDocs();
    const running = (S.timeEntries || []).find((e) => e.uid === uid() && !e.endedAt);
    const bal = T.leaveBalance(S.leave || [], uid(), today().slice(0, 4), { ...T.DEFAULT_ALLOWANCE, ...(S.teamSettings?.leaveAllowance || {}) });
    const tiles = [
      kpi({ ic: 'tasks', label: overdue.length ? `Tasks to do (${overdue.length} overdue)` : 'Tasks to do', n: myOpen.length, href: '#/tasks', warn: !!overdue.length }),
      kpi({ ic: 'file', tone: 'amber', label: 'Documents to read', n: unread.length, href: '#/docs', warn: !!unread.length }),
      isMgr() ? kpi({ ic: 'sun', tone: 'green', label: 'Leave to approve', n: toApprove.length, href: '#/leave', warn: !!toApprove.length })
        : kpi({ ic: 'sun', tone: 'green', label: 'Annual leave days left', n: bal.annual.left, href: '#/leave' }),
      kpi({ ic: 'clock', tone: 'purple', label: 'Your timer', n: running ? 'Running' : 'Stopped', href: '#/time' }),
      CAL.tile(), ...BIZ.tiles(),
    ];
    return `<h3>Your work</h3><div class="grid g4">${tiles.join('')}</div>`;
  }
  /** Things that need this person's attention (bell and menu badges). */
  function attention() {
    const out = [];
    const od = myOpenTasks().filter((t) => T.taskIsOverdue(t));
    if (od.length) out.push({ key: 'tasks', ic: 'tasks', text: `${plural(od.length, 'overdue task')}`, sub: 'Assigned to you', href: '#/tasks', warn: true, n: od.length });
    const un = unreadDocs();
    if (un.length) out.push({ key: 'docs', ic: 'file', text: `${plural(un.length, 'document')} to read`, sub: 'Please confirm you have read them', href: '#/docs', n: un.length });
    const ap = isMgr() ? leaveToApprove() : [];
    if (ap.length) out.push({ key: 'leave', ic: 'sun', text: `${plural(ap.length, 'leave request')} to approve`, sub: ap.slice(0, 2).map((r) => r.name).join(', '), href: '#/leave', n: ap.length });
    out.push(...CAL.attention(), ...BIZ.attention());
    return out;
  }
  function employeeHome() {
    const first = String(me().name || '').trim().split(/\s+/)[0] || 'there';
    const mine = myOpenTasks().sort((x, y) => (x.dueAt || 9e15) - (y.dueAt || 9e15)).slice(0, 5);
    return `<div class="ph greet"><div><h1>${greeting()}, ${esc(first)}</h1><p>Here's what is on your plate today.</p></div>
      <div class="ph-act"><a class="btn primary" href="#/time">${icon('clock', 18)}Clock in / out</a><a class="btn" href="#/leave">Request leave</a></div></div>
      ${homeCards()}
      <div class="two-col even"><div class="card"><div class="card-h"><h3>My tasks</h3><a href="#/tasks">All tasks</a></div>${mine.length
        ? mine.map((t) => `<a class="row" style="box-shadow:none" href="#/tasks/${esc(t.id)}"><div class="main"><div class="t">${esc(t.title)}</div><div class="s">${t.dueAt ? 'Due ' + esc(L.fmtDate(t.dueAt)) : 'No due date'}</div></div>${T.taskIsOverdue(t) ? badge('overdue') : ''}${badge(t.status)}</a>`).join('')
        : '<div class="muted">Nothing to do right now.</div>'}</div>${CAL.upcomingCard()}</div>`;
  }

  // ---------------------------------------------------------------- tasks
  const PRIO = { low: 'Low', normal: 'Normal', high: 'High' };
  const STAT = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
  function viewTasks(a) {
    if (a === 'new') return taskForm({ assigneeId: uid(), priority: 'normal' }, null);
    if (a) {
      const t = (S.tasks || []).find((x) => x.id === a);
      return t ? taskDetail(t) : `<p class="muted">Loading… or this task is not visible to you. <a href="#/tasks">Back</a></p>`;
    }
    const scope = S.q.tasksTab || (isMgr() ? 'all' : 'mine');
    let list = S.tasks || [];
    if (scope === 'mine') list = list.filter((t) => t.assigneeId === uid());
    else if (scope === 'set') list = list.filter((t) => t.createdBy === uid() && t.assigneeId !== uid());
    const st = S.q.tasksStatus || 'all';
    const cnt = { all: list.length, todo: list.filter((t) => t.status === 'todo').length, in_progress: list.filter((t) => t.status === 'in_progress').length, overdue: list.filter((t) => T.taskIsOverdue(t)).length, done: list.filter((t) => t.status === 'done').length };
    const open = list.filter((t) => t.status !== 'done').sort((x, y) => (x.dueAt || 9e15) - (y.dueAt || 9e15));
    const done = list.filter((t) => t.status === 'done').sort((x, y) => (y.completedAt || 0) - (x.completedAt || 0));
    const shown = st === 'all' ? [...open, ...done.slice(0, 15)] : st === 'overdue' ? open.filter((t) => T.taskIsOverdue(t)) : st === 'done' ? done.slice(0, 50) : open.filter((t) => t.status === st);
    const row = (t) => `<tr class="go" data-go="#/tasks/${esc(t.id)}"><td><a class="cell t1" href="#/tasks/${esc(t.id)}">${esc(t.title)}</a>${t.jobId ? `<div class="t2">${esc(S.jobs.find((j) => j.id === t.jobId)?.title || '')}</div>` : ''}</td>
      <td data-l="Assigned to"><span class="who">${av(t.assigneeId, 'sm')}${esc(nameOf(t.assigneeId))}</span></td>
      <td data-l="Priority">${badge(t.priority || 'normal')}</td>
      <td data-l="Due">${t.dueAt ? esc(L.fmtDate(t.dueAt)) : '—'} ${T.taskIsOverdue(t) ? badge('overdue') : ''}</td>
      <td data-l="Status">${badge(t.status)}</td></tr>`;
    const scopes = [['mine', 'Mine'], ...(isMgr() ? [['set', 'I assigned'], ['all', 'Whole team']] : [])];
    const stTabs = [['all', 'All'], ['todo', 'To do'], ['in_progress', 'In progress'], ['overdue', 'Overdue'], ['done', 'Done']];
    return `${head('Tasks', `${scopes.length > 1 ? `<div class="viewsw">${scopes.map(([k, l]) => `<button class="${scope === k ? 'on' : ''}" data-action="tasks-tab" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}<a class="btn primary" href="#/tasks/new">${icon('plus', 18)}New task</a>`, 'Track and manage what your team needs to get done.')}
      <div class="seg">${stTabs.map(([k, l]) => `<button class="${st === k ? 'on' : ''}" data-action="tasks-status" data-status="${k}">${l} (${cnt[k]})</button>`).join('')}</div>
      ${shown.length ? `<div class="dt-wrap"><table class="dt"><thead><tr><th>Task</th><th>Assigned to</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>` : empty('Nothing to do here.')}`;
  }
  function taskForm(t, id) {
    const who = assignable();
    return `${back('#/tasks', 'Tasks')}<h2>${id ? 'Edit task' : 'New task'}</h2>
      <form data-team="task" data-id="${esc(id || '')}"><fieldset>
      ${fld('What needs doing', 'title', t.title || '', { required: true })}
      ${fld('Give it to', 'assigneeId', t.assigneeId || uid(), { type: 'select', required: true, options: people(who).slice(1) })}
      ${fld('Due date', 'dueAt', L.toDateInput(t.dueAt), { type: 'date' })}
      ${fld('Priority', 'priority', t.priority || 'normal', { type: 'select', options: Object.entries(PRIO) })}
      ${fld('Linked job (optional)', 'jobId', t.jobId || '', { type: 'select', options: jobOptions() })}
      ${fld('Details', 'description', t.description || '', { type: 'textarea' })}</fieldset>
      <div class="bar"><button class="btn primary">${id ? 'Save changes' : 'Create task'}</button></div></form>`;
  }
  function taskDetail(t) {
    const boss = isOwner() || t.createdBy === uid() || (mem(t.assigneeId)?.ancestors || []).includes(uid());
    const mineT = t.assigneeId === uid();
    const job = S.jobs.find((j) => j.id === t.jobId);
    return `${back('#/tasks', 'Tasks')}<h2>${esc(t.title)}</h2>
      <div class="card"><p>${badge(t.status)} ${t.priority === 'high' ? badge('high') : ''} ${T.taskIsOverdue(t) ? badge('overdue') : ''}</p>
      <p class="muted">For <b>${esc(nameOf(t.assigneeId))}</b> · set by ${esc(t.createdByName || nameOf(t.createdBy))}${t.dueAt ? ` · due ${esc(L.fmtDate(t.dueAt))}` : ''}${job ? ` · job <a href="#/jobs/${esc(job.id)}">${esc(job.title)}</a>` : ''}</p>
      ${t.description ? `<p style="white-space:pre-wrap">${esc(t.description)}</p>` : ''}
      ${mineT || boss ? `<div class="bar">${Object.entries(STAT).filter(([k]) => k !== t.status).map(([k, l]) => `<button class="btn ${k === 'done' ? 'primary' : ''}" data-action="task-status" data-id="${esc(t.id)}" data-status="${k}">${k === 'done' ? 'Mark done' : 'Set ' + l.toLowerCase()}</button>`).join('')}</div>` : ''}</div>
      <h3>Comments</h3>${(t.comments || []).map((c) => `<div class="msg"><b>${esc(c.name)}</b> <span class="muted">${esc(L.fmtDate(c.at))}</span><br>${esc(c.text)}</div>`).join('') || empty('No comments yet.')}
      <form data-team="comment" data-id="${esc(t.id)}" class="inline"><input name="text" placeholder="Add a comment" maxlength="500" required><button class="btn">Send</button></form>
      ${boss ? `<h3>Change details</h3>${taskFormInner(t)}<div class="bar"><button class="btn danger" data-action="task-delete" data-id="${esc(t.id)}">Delete task</button></div>` : ''}`;
  }
  const taskFormInner = (t) => taskForm(t, t.id).replace(/^.*?<form/s, '<form');

  // ---------------------------------------------------------------- documents
  const DOC_KIND = { instruction: 'Work instruction', policy: 'Policy', safety: 'Safety', contract: 'Contract / agreement', notice: 'Notice', other: 'Other' };
  function viewDocs(a) {
    if (a === 'new') return docForm();
    if (a) {
      const d = (S.workDocs || []).find((x) => x.id === a);
      return d ? docDetail(d) : `<p class="muted">Loading… or this document is not visible to you. <a href="#/docs">Back</a></p>`;
    }
    const list = [...(S.workDocs || [])].sort(byNewest);
    const row = (d) => {
      const mineR = (d.recipients || []).includes(uid());
      const pending = mineR && d.requireAck && !d.acks?.[uid()];
      const sent = d.createdBy === uid();
      const got = Object.keys(d.acks || {}).length;
      return `<tr class="go" data-go="#/docs/${esc(d.id)}"><td><div class="who"><span class="ft ft-doc">${icon('file', 18)}</span><div><a class="cell t1" href="#/docs/${esc(d.id)}">${esc(d.title)}</a><div class="t2">${esc(DOC_KIND[d.kind] || d.kind)}</div></div></div></td>
        <td data-l="From"><span class="who">${av(d.createdBy, 'sm')}${esc(d.createdByName)}</span></td><td data-l="Date">${esc(L.fmtDate(d.createdAt))}</td>
        <td data-l="Read">${pending ? badge('to read') : sent && d.requireAck ? `${got}/${(d.recipients || []).length} read` : d.requireAck && mineR ? '<span class="ok">✓ Read</span>' : '—'}</td></tr>`;
    };
    return `${head('Documents', isMgr() ? `<a class="btn primary" href="#/docs/new">${icon('plus', 18)}Send a document</a>` : '', 'Instructions, policies and notices from your managers.')}${list.length ? `<div class="dt-wrap"><table class="dt"><thead><tr><th>Name</th><th>From</th><th>Date</th><th>Read</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : empty('No documents yet.')}`;
  }
  function docForm() {
    if (!isMgr()) return `<p class="muted">Only managers can send documents. <a href="#/docs">Back</a></p>`;
    const team = myTeam().filter((m) => m.uid !== uid());
    return `${back('#/docs', 'Documents')}<h2>Send a document</h2>
      <form data-team="doc"><fieldset>
      ${fld('Title', 'title', '', { required: true })}
      ${fld('Type', 'kind', 'instruction', { type: 'select', options: Object.entries(DOC_KIND) })}
      ${fld('Who gets it', 'audience', 'team', { type: 'select', options: [['team', `My whole team (${team.length})`], ...(isOwner() ? [['all', `Everyone (${active().length - 1})`]] : []), ['pick', 'Pick people…']] })}
      <div class="picks">${team.map((m) => `<label class="check-f"><input type="checkbox" name="uid" value="${esc(m.uid)}"> ${esc(m.name)}</label>`).join('') || '<span class="muted">No team members yet.</span>'}</div>
      ${fld('Message / instructions', 'body', '', { type: 'textarea' })}
      ${fld('Link to a file (https, optional)', 'link', '', { type: 'url' })}
      <label class="check-f"><input type="checkbox" name="requireAck" checked> People must confirm they have read it</label></fieldset>
      <p class="muted">Documents cannot be edited after sending, so a confirmation always means the same text. Send a new one to change it.</p>
      <div class="bar"><button class="btn primary">Send</button></div></form>`;
  }
  function docDetail(d) {
    const mineR = (d.recipients || []).includes(uid());
    const link = L.safeUrl(d.link);
    const canSee = d.createdBy === uid() || isOwner();
    return `${back('#/docs', 'Documents')}<h2>${esc(d.title)}</h2><p class="muted">${esc(DOC_KIND[d.kind] || d.kind)} · from ${esc(d.createdByName)} · ${esc(L.fmtDate(d.createdAt))}</p>
      <div class="card">${d.body ? `<p style="white-space:pre-wrap">${esc(d.body)}</p>` : ''}${link ? `<p><a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open attached link</a></p>` : ''}</div>
      ${mineR && d.requireAck ? (d.acks?.[uid()] ? `<p class="ok">✓ You confirmed on ${esc(L.fmtDate(d.acks[uid()]))}</p>` : `<button class="btn primary wide" data-action="doc-ack" data-id="${esc(d.id)}">I have read and understood this</button>`) : ''}
      ${d.requireAck && (canSee || isMgr()) ? `<h3>Who has read it</h3>${(d.recipients || []).map((r) => `<div class="row"><div class="main"><div class="t">${esc(nameOf(r))}</div></div>${d.acks?.[r] ? `<span class="s">✓ ${esc(L.fmtDate(d.acks[r]))}</span>` : badge('waiting')}</div>`).join('')}` : ''}
      ${canSee ? `<div class="bar"><button class="btn danger" data-action="doc-delete" data-id="${esc(d.id)}">Remove document</button></div>` : ''}`;
  }

  // ---------------------------------------------------------------- time
  function viewTime() {
    const mine = (S.timeEntries || []).filter((e) => e.uid === uid());
    const running = mine.find((e) => !e.endedAt);
    const since = daysAgoKey(14);
    const recent = mine.filter((e) => e.endedAt && e.date >= since).sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : (y.createdAt || 0) - (x.createdAt || 0)));
    const weekHrs = mine.filter((e) => e.date >= weekStart()).reduce((n, e) => n + (e.hours || 0), 0);
    const timer = running
      ? `<div class="card"><h3>Timer running</h3><p class="big" id="elapsed" data-since="${running.startedAt}">…</p><p class="muted">Started ${new Date(running.startedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}${running.jobId ? ' · ' + esc(S.jobs.find((j) => j.id === running.jobId)?.title || 'job') : ''}</p>
         <button class="btn primary wide" data-action="timer-stop" data-id="${esc(running.id)}">Stop timer</button></div>`
      : `<div class="card"><h3>Clock in</h3><form data-team="timer-start">${fld('Job (optional)', 'jobId', '', { type: 'select', options: jobOptions('No job') })}${fld('Note', 'note', '')}<button class="btn primary wide">Start timer</button></form></div>`;
    const team = isMgr() ? teamHours() : '';
    return `${head('Time', `<span class="pill">${hrs(weekHrs)} this week</span>`)}${timer}
      <details class="card"><summary><b>Add time you forgot to log</b></summary><form data-team="time-manual">
      ${fld('Date', 'date', today(), { type: 'date', required: true })}${fld('Hours', 'hours', '', { type: 'number', required: true, attrs: 'step="0.25" min="0.25" max="24" inputmode="decimal"' })}
      ${fld('Job (optional)', 'jobId', '', { type: 'select', options: jobOptions() })}${fld('Note', 'note', '')}<button class="btn">Add</button></form></details>
      <h3>Your last 14 days</h3>${recent.map((e) => `<div class="row"><div class="main"><div class="t">${esc(fmtDay(e.date))} · ${hrs(e.hours)}${e.manual ? ' <span class="muted">(added)</span>' : ''}${e.capped ? ' <span class="err">capped at 16 h</span>' : ''}</div><div class="s">${esc(S.jobs.find((j) => j.id === e.jobId)?.title || 'No job')}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
        <button class="x" data-action="time-delete" data-id="${esc(e.id)}" aria-label="Delete entry">×</button></div>`).join('') || empty('No time logged yet.')}${team}`;
  }
  function teamHours() {
    const ws = weekStart(), td = today();
    const rows = myTeam().filter((m) => m.uid !== uid()).map((m) => {
      const es = (S.timeEntries || []).filter((e) => e.uid === m.uid);
      const sum = (f) => es.filter(f).reduce((n, e) => n + (e.hours || 0), 0);
      const running = es.some((e) => !e.endedAt);
      return `<tr><td>${esc(m.name)}${running ? ' <span class="badge b-in_progress">working</span>' : ''}</td><td>${hrs(sum((e) => e.date === td))}</td><td>${hrs(sum((e) => e.date >= ws))}</td><td>${hrs(sum((e) => e.date >= daysAgoKey(29)))}</td></tr>`;
    }).join('');
    return rows ? `<h3>Your team's hours</h3><div class="scroll"><table class="tbl"><thead><tr><th>Person</th><th>Today</th><th>This week</th><th>30 days</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
  }

  // ---------------------------------------------------------------- leave
  const allowance = () => ({ ...T.DEFAULT_ALLOWANCE, ...(S.teamSettings?.leaveAllowance || {}) });
  function viewLeave() {
    const year = today().slice(0, 4);
    const bal = T.leaveBalance(S.leave || [], uid(), year, allowance());
    const mine = (S.leave || []).filter((r) => r.uid === uid()).sort((x, y) => (y.from > x.from ? 1 : -1));
    const approvals = (S.leave || []).filter((r) => r.status === 'pending' && (r.approvers || []).includes(uid())).sort((x, y) => (x.from > y.from ? 1 : -1));
    const upcoming = (S.leave || []).filter((r) => r.status === 'approved' && r.to >= today() && r.to <= daysAgoKey(-60)).sort((x, y) => (x.from > y.from ? 1 : -1));
    const rowOf = (r, who) => `<div class="row"><div class="main"><div class="t">${who ? esc(r.name) + ' · ' : ''}${esc(T.LEAVE_TYPES[r.type])}: ${esc(fmtDay(r.from))}${r.to !== r.from ? ' to ' + esc(fmtDay(r.to)) : ''}</div><div class="s">${r.days} working day${r.days === 1 ? '' : 's'}${r.note ? ' · ' + esc(r.note) : ''}${r.decidedByName ? ` · ${esc(r.decidedByName)}` : ''}${r.decisionNote ? `: “${esc(r.decisionNote)}”` : ''}</div></div>`;
    const stat = (label, b) => `<div class="stat"><b>${b.left}</b><span>${esc(label)} left of ${b.allowed}</span></div>`;
    return `${head('Leave')}
      <div class="grid3">${stat('Annual', bal.annual)}${stat('Sick', bal.sick)}${stat('Family', bal.family)}</div>
      <p class="muted">${bal.unpaid.used ? `Unpaid leave this year: ${bal.unpaid.used} days. ` : ''}Weekends are not counted. Public holidays are not taken off automatically.</p>
      ${approvals.length ? `<h3>Waiting for you</h3>${approvals.map((r) => `${rowOf(r, true)}<button class="btn primary" data-action="leave-approve" data-id="${esc(r.id)}">Approve</button><button class="btn danger" data-action="leave-decline" data-id="${esc(r.id)}">Decline</button></div>`).join('')}` : ''}
      <details class="card" ${mine.length ? '' : 'open'}><summary><b>Request leave</b></summary><form data-team="leave">
      ${fld('Type', 'type', 'annual', { type: 'select', options: Object.entries(T.LEAVE_TYPES) })}${fld('From', 'from', today(), { type: 'date', required: true })}${fld('To', 'to', today(), { type: 'date', required: true })}${fld('Note (optional)', 'note', '')}
      <button class="btn primary">Send request</button></form></details>
      <h3>Your requests</h3>${mine.map((r) => `${rowOf(r)}${badge(r.status)}${r.status === 'pending' || (r.status === 'approved' && r.from > today()) ? `<button class="btn" data-action="leave-cancel" data-id="${esc(r.id)}">Cancel</button>` : ''}</div>`).join('') || empty('No requests yet.')}
      ${isMgr() ? `<h3>Who is off (next 60 days)</h3>${upcoming.map((r) => `${rowOf(r, true)}</div>`).join('') || empty('Nobody.')}` : ''}
      ${isOwner() ? `<h3>Yearly allowances (days)</h3><form data-team="leave-allowance" class="inline3">${['annual', 'sick', 'family'].map((k) => fld(T.LEAVE_TYPES[k], k, allowance()[k], { type: 'number', attrs: 'min="0" max="365" step="1"' })).join('')}<button class="btn">Save</button></form>` : ''}`;
  }

  // ---------------------------------------------------------------- chat
  const chatTitle = (c) => (c.dm ? nameOf(c.members.find((m) => m !== uid())) : c.name);
  const chatFace = (c, size = 'md') => (c.dm
    ? av(c.members.find((m) => m !== uid()), size)
    : `<span class="av av-${size}" style="background:var(--brand-soft);color:var(--brand)">${icon('users', size === 'lg' ? 22 : 17)}</span>`);
  const clock = (ms) => (Date.now() - ms < 864e5 ? new Date(ms).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : L.fmtDate(ms));
  function viewChat(a) {
    if (a === 'new') return chatNew();
    const list = [...(S.chats || [])].sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0));
    const listHtml = `<div class="chat-list"><div class="cl-h"><b>Messages</b><a class="btn sm primary" href="#/chat/new">${icon('plus', 16)}New chat</a></div>${list.map((c) => `<a class="cl-item ${c.id === a ? 'on' : ''}" href="#/chat/${esc(c.id)}">${chatFace(c)}<div class="mid"><div class="nm">${esc(chatTitle(c))}</div>
      <div class="pv">${c.lastMessage ? esc(c.lastMessage.name + ': ' + c.lastMessage.text) : 'No messages yet'}</div></div>${c.lastAt ? `<span class="tm">${esc(clock(c.lastAt))}</span>` : ''}</a>`).join('') || '<div class="chat-empty">No chats yet. Start one.</div>'}</div>`;
    const pane = a ? chatThread(a) : `<div class="chat-pane"><div class="chat-empty">${icon('chat', 40)}<p>Pick a conversation, or start a new one.</p></div></div>`;
    return `<div class="chat ${a ? 'has-thread' : ''}">${listHtml}${pane}</div>`;
  }
  function chatNew() {
    const others = active().filter((m) => m.uid !== uid());
    return `${back('#/chat', 'Chat')}${head('New chat', '', 'Pick one person for a private chat, or several for a group.')}<form data-team="chat-new"><fieldset>
      <div class="picks">${others.map((m) => `<label class="check-f"><input type="checkbox" name="uid" value="${esc(m.uid)}"> ${avatar(m, 'sm')} ${esc(m.name)} <span class="muted">${esc(T.ROLE_LABEL[m.role] || '')}</span></label>`).join('') || '<span class="muted">Nobody else is in the business yet.</span>'}</div>
      ${fld('Group name (needed for groups)', 'name', '')}</fieldset><div class="bar"><button class="btn primary">Start chat</button></div></form>`;
  }
  function chatThread(id) {
    const c = (S.chats || []).find((x) => x.id === id);
    if (!c) return `<div class="chat-pane"><div class="chat-empty">Loading… or you are not in this chat.<br><a href="#/chat">Back to chats</a></div></div>`;
    ensureMessages(id);
    const addable = active().filter((m) => !c.members.includes(m.uid));
    return `<div class="chat-pane"><div class="ch"><a class="link" href="#/chat" aria-label="Back to chats">${icon('left', 20)}</a>${chatFace(c)}<div style="min-width:0"><div class="nm">${esc(chatTitle(c))}</div>
      <div class="sub">${c.dm ? 'Private chat' : esc(c.members.map(nameOf).join(', '))}</div></div></div>
      ${!c.dm ? `<details class="chat-opts"><summary>Group options</summary>
        ${(c.createdBy === uid() || isOwner()) && addable.length ? `<form data-team="chat-add" data-id="${esc(id)}" class="inline">${fld('Add someone', 'uid', '', { type: 'select', options: people(addable) })}<button class="btn">Add</button></form>` : ''}
        <button class="btn danger sm" data-action="chat-leave" data-id="${esc(id)}">Leave group</button></details>` : ''}
      <div class="thread" id="msgs">${messagesHtml(id)}</div>
      <form data-team="msg" data-id="${esc(id)}" class="composer"><input name="text" placeholder="Write a message" maxlength="2000" autocomplete="off" required aria-label="Message"><button class="btn primary" aria-label="Send">${icon('send', 18)}</button></form></div>`;
  }
  const messagesHtml = (chatId) => {
    const list = S.messages?.[chatId];
    if (!list) return empty('Loading messages…');
    return list.map((m) => {
      const mine = m.uid === uid();
      return `<div class="msgrow ${mine ? 'mine' : ''}">${mine ? '' : av(m.uid, 'sm')}<div class="bubble"><span class="who">${mine ? 'You' : esc(m.name)} · ${new Date(m.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>${esc(m.text)}</div></div>`;
    }).join('') || empty('Say hello 👋');
  };
  function ensureMessages(chatId) {
    if (S.msgSub?.id === chatId) return;
    S.msgSub?.off?.();
    S.msgSub = { id: chatId, off: D.listenMessages(S.tid, chatId, (list) => {
      S.messages = { ...(S.messages || {}), [chatId]: list };
      const el = document.getElementById('msgs');
      if (el && S.msgSub?.id === chatId) {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        el.innerHTML = messagesHtml(chatId);
        if (atBottom) el.scrollTop = el.scrollHeight;
      }
    }) };
  }
  const leaveChatPage = () => { S.msgSub?.off?.(); S.msgSub = null; };

  // ---------------------------------------------------------------- team
  const rankSort = (x, y) => T.rank(x.role) - T.rank(y.role) || (x.name || '').localeCompare(y.name || '');
  function viewTeam(a) {
    if (a === 'new') return isOwner() ? inviteForm() : `<p class="muted">Only the owner can add people. <a href="#/team">Back</a></p>`;
    if (a) return memberDetail(a);
    const seats = S.tenant.entitlements.limits.seats;
    const used = active().length;
    const tab = S.q.teamTab || 'all';
    const all = members().filter((m) => m.status !== 'inactive').sort(rankSort);
    const cnt = { all: all.length, active: all.filter((m) => m.status === 'active').length, invited: all.filter((m) => m.status === 'invited').length, off: members().filter((m) => m.status === 'inactive').length };
    const list = tab === 'active' ? all.filter((m) => m.status === 'active') : tab === 'invited' ? all.filter((m) => m.status === 'invited') : tab === 'off' ? members().filter((m) => m.status === 'inactive') : all;
    const card = (m) => `<a class="pcard" href="#/team/${esc(m.uid)}">
      <div class="top-r">${avatar(m, 'lg')}<div style="min-width:0"><div class="nm">${esc(m.name)}${m.uid === uid() ? ' <span class="muted">(you)</span>' : ''}</div><span class="role">${esc(T.ROLE_LABEL[m.role] || m.role)}</span> ${m.status === 'invited' ? badge('invited') : m.status === 'inactive' ? badge('inactive') : ''}</div></div>
      ${m.department ? `<div class="ln">${icon('briefcase', 14)} ${esc(m.department)}</div>` : ''}${m.email ? `<div class="ln">${icon('mail', 14)} ${esc(m.email)}</div>` : ''}${m.managerId ? `<div class="ln">Reports to ${esc(nameOf(m.managerId))}</div>` : ''}</a>`;
    const tabs = [['all', 'All members'], ['active', 'Active'], ['invited', 'Invited'], ...(cnt.off ? [['off', 'Switched off']] : [])];
    return `${head('Team', isOwner() ? `<a class="btn primary" href="#/team/new">${icon('plus', 18)}Add person</a>` : '', `${used} of ${seats === -1 ? 'unlimited' : seats} people${seats !== -1 && used >= seats ? '. Contact us to add more seats.' : '.'}`)}
      <div class="seg">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-action="team-tab" data-tab="${k}">${l} (${cnt[k]})</button>`).join('')}</div>
      ${list.length ? `<div class="people">${list.map(card).join('')}</div>` : empty('Nobody here.')}`;
  }
  function inviteForm() {
    const bosses = active().filter((m) => T.isManagerRole(m.role)).sort(rankSort);
    const done = S.lastInvite;
    return `${back('#/team', 'Team')}<h2>Add a person</h2>
      ${done ? `<div class="card ok-card"><b>${esc(done.name)} was added.</b><p class="muted">They need to set a password. We asked Firebase to email them a link. You can also send it yourself:</p>
        ${done.link ? `<div class="bar"><a class="btn primary" target="_blank" rel="noopener noreferrer" href="${esc(wa(`Hi ${done.name}, you have been added to ${S.tenant.name} on ${ctx.platformName}. Set your password here and sign in: ${done.link}`))}">Send on WhatsApp</a><button class="btn" data-action="copy-link">Copy link</button></div><p class="muted" style="word-break:break-all;font-size:.8rem" id="invite-link">${esc(done.link)}</p>` : '<p class="muted">They can use “Forgot password?” on the sign-in page with that email.</p>'}</div>` : ''}
      <form data-team="invite"><fieldset>
      ${fld('Full name', 'name', '', { required: true })}${fld('Email', 'email', '', { type: 'email', required: true })}${fld('Cell number', 'phone', '', { type: 'tel' })}
      ${fld('Role', 'role', 'employee', { type: 'select', options: [['employee', 'Employee'], ['manager', 'Manager'], ['dept_head', 'Department head']] })}
      ${fld('Reports to', 'managerId', uid(), { type: 'select', options: bosses.map((m) => [m.uid, `${m.name} (${T.ROLE_LABEL[m.role]})`]) })}
      ${fld('Department (optional)', 'department', '')}
      ${fld('Hourly cost to you (R, for job costing)', 'hourlyRate', '', { type: 'number', attrs: 'min="0" step="0.01" inputmode="decimal"' })}</fieldset>
      <p class="muted">A manager can report to a department head or to you. An employee can report to anyone above them. Only you can see hourly rates.</p>
      <div class="bar"><button class="btn primary">Add person</button></div></form>`;
  }
  function memberDetail(id) {
    const m = mem(id);
    if (!m) return `${back('#/team', 'Team')}<p class="muted">Loading…</p>`;
    const es = (S.timeEntries || []).filter((e) => e.uid === id);
    const week = es.filter((e) => e.date >= weekStart()).reduce((n, e) => n + (e.hours || 0), 0);
    const open = (S.tasks || []).filter((t) => t.assigneeId === id && t.status !== 'done');
    const boss = active().filter((x) => T.isManagerRole(x.role) && x.uid !== id && !(x.ancestors || []).includes(id));
    const edit = isOwner() && m.role !== 'owner';
    return `${back('#/team', 'Team')}<div class="card"><div class="profile-top">${avatar(m, 'xl')}<div><h2 style="margin:0">${esc(m.name)}</h2><div class="muted">${esc(T.ROLE_LABEL[m.role] || m.role)}${m.department ? ' · ' + esc(m.department) : ''}</div><div class="muted">${esc(m.email || '')}${m.phone ? ' · ' + esc(m.phone) : ''}</div>${m.uid === uid() ? '<p style="margin:.6rem 0 0"><a class="btn sm" href="#/profile">Change my picture</a></p>' : ''}</div></div></div>
      <div class="grid"><div class="stat"><b>${hrs(week)}</b><span>This week</span></div><div class="stat"><b>${open.length}</b><span>Open tasks</span></div></div>
      ${m.managerId ? `<p class="muted">Reports to ${esc(nameOf(m.managerId))}</p>` : ''}
      ${edit ? `<form data-team="member-edit" data-id="${esc(id)}"><fieldset>
        ${fld('Name', 'name', m.name, { required: true })}${fld('Cell number', 'phone', m.phone || '', { type: 'tel' })}
        ${fld('Role', 'role', m.role, { type: 'select', options: [['employee', 'Employee'], ['manager', 'Manager'], ['dept_head', 'Department head']] })}
        ${fld('Reports to', 'managerId', m.managerId, { type: 'select', options: boss.map((x) => [x.uid, `${x.name} (${T.ROLE_LABEL[x.role]})`]) })}
        ${fld('Department', 'department', m.department || '')}${fld('Hourly cost (R)', 'hourlyRate', S.rates?.[id] ?? 0, { type: 'number', attrs: 'min="0" step="0.01"' })}</fieldset>
        <div class="bar"><button class="btn primary">Save</button>
        ${m.status === 'inactive' ? `<button type="button" class="btn" data-action="member-status" data-id="${esc(id)}" data-status="active">Switch back on</button>` : `<button type="button" class="btn danger" data-action="member-status" data-id="${esc(id)}" data-status="inactive">Switch off access</button>`}</div></form>
        <p class="muted">Switching someone off removes their access straight away. Their records stay.</p>` : ''}`;
  }

  // ---------------------------------------------------------------- payroll (records only)
  const lineRow = (kind, l = {}) => `<div class="item pay" data-kind="${kind}"><input data-k="desc" placeholder="${kind === 'earn' ? 'e.g. Basic salary' : 'e.g. PAYE, UIF'}" value="${esc(l.desc || '')}"><input data-k="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.amount ?? '')}"><button type="button" class="x" data-action="ps-del-line" aria-label="Remove line">×</button></div>`;
  function viewPayroll(a) {
    const list = [...(S.payslips || [])].sort((x, y) => (y.period > x.period ? 1 : y.period < x.period ? -1 : byNewest(x, y)));
    if (!isOwner()) {
      const mineP = list.filter((p) => p.employeeId === uid());
      if (a) { const p = mineP.find((x) => x.id === a); return p ? payslipView(p) : `<p class="muted">Not found. <a href="#/payroll">Back</a></p>`; }
      return `${head('My pay')}<p class="muted">Your payslips from your employer. They are only visible to you and the owner.</p>${mineP.map((p) => payslipRow(p)).join('') || empty('No payslips yet.')}`;
    }
    if (a === 'new') return payslipForm({ period: today().slice(0, 7), earnings: [{ desc: 'Basic salary', amount: '' }], deductions: [] }, null);
    if (a) {
      const p = list.find((x) => x.id === a);
      if (!p) return `<p class="muted">Loading… <a href="#/payroll">Back</a></p>`;
      return p.status === 'draft' ? payslipForm(p, p.id) : payslipView(p);
    }
    return `${head('Payroll', '<a class="btn primary" href="#/payroll/new">+ New payslip</a>')}
      <div class="banner">Payslips here are records. They do not calculate PAYE or UIF, and no money moves through ${esc(ctx.platformName)}. You pay your staff yourself.</div>
      ${list.map((p) => payslipRow(p, true)).join('') || empty('No payslips yet.')}`;
  }
  const payslipRow = (p, owner) => `<a class="row" href="#/payroll/${esc(p.id)}"><div class="main"><div class="t">${esc(p.period)}${owner ? ' · ' + esc(p.employeeName) : ''}</div><div class="s">Net ${esc(zar(p.net))}</div></div>${badge(p.status)}</a>`;
  function payslipForm(p, id) {
    const emps = active();
    return `${back('#/payroll', 'Payroll')}<h2>${id ? 'Edit draft payslip' : 'New payslip'}</h2>
      <form data-team="payslip" data-id="${esc(id || '')}"><fieldset>
      ${fld('Employee', 'employeeId', p.employeeId || '', { type: 'select', required: true, options: people(emps) })}
      ${fld('Pay month', 'period', p.period, { type: 'month', required: true })}
      <h3>Earnings</h3><div id="earn">${(p.earnings || []).map((l) => lineRow('earn', l)).join('')}</div><button type="button" class="btn ghost" data-action="ps-add-line" data-kind="earn">+ Earnings line</button>
      <h3>Deductions</h3><div id="ded">${(p.deductions || []).map((l) => lineRow('ded', l)).join('')}</div><button type="button" class="btn ghost" data-action="ps-add-line" data-kind="ded">+ Deduction line</button>
      ${fld('Notes', 'notes', p.notes || '', { type: 'textarea' })}</fieldset>
      <div class="bar"><button class="btn primary" name="intent" value="save">Save draft</button><button class="btn" name="intent" value="issue">Save &amp; issue to employee</button>
      ${id ? `<button type="button" class="btn danger" data-action="ps-delete" data-id="${esc(id)}">Delete draft</button>` : ''}</div></form>
      <p class="muted">Enter the amounts yourself. Once issued a payslip is locked, and the employee can see it.</p>`;
  }
  const readLines = (f, id) => [...f.querySelectorAll(`#${id} .item`)].map((r) => ({ desc: r.querySelector('[data-k=desc]').value.trim(), amount: Number(r.querySelector('[data-k=amount]').value) || 0 })).filter((l) => l.desc || l.amount);
  const payslipView = (p) => `${back('#/payroll', 'Payslips')}<h2>Payslip ${esc(p.period)}</h2>
    <div class="card"><p><b>${esc(p.employeeName)}</b> · ${badge(p.status)}</p><table class="tbl"><tbody>
      ${(p.earnings || []).map((l) => `<tr><td>${esc(l.desc)}</td><td class="n">${esc(zar(l.amount))}</td></tr>`).join('')}
      <tr><th>Gross</th><th class="n">${esc(zar(p.gross))}</th></tr>
      ${(p.deductions || []).map((l) => `<tr><td>− ${esc(l.desc)}</td><td class="n">${esc(zar(l.amount))}</td></tr>`).join('')}
      <tr><th>Net pay</th><th class="n">${esc(zar(p.net))}</th></tr></tbody></table>${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ''}</div>
    <div class="bar"><a class="btn primary" href="#/print/payslips/${esc(p.id)}">Print / PDF</a></div>`;
  function payslipDoc(p) {
    const b = S.profile || {};
    const br = (s) => esc(s || '').replace(/\n/g, '<br>');
    return `<div class="doc"><header><div><strong>${esc(b.businessName || S.tenant.name)}</strong><br>${br(b.address)}${b.vatNo ? `<br>VAT No: ${esc(b.vatNo)}` : ''}</div><div style="text-align:right"><h1>PAYSLIP</h1>${esc(p.period)}<br>Issued ${esc(L.fmtDate(p.issuedAt))}</div></header>
      <p><strong>Employee:</strong> ${esc(p.employeeName)}</p>
      <table><thead><tr><th>Earnings</th><th class="n">Amount</th></tr></thead><tbody>${(p.earnings || []).map((l) => `<tr><td>${esc(l.desc)}</td><td class="n">${esc(zar(l.amount))}</td></tr>`).join('')}<tr><td><strong>Gross</strong></td><td class="n"><strong>${esc(zar(p.gross))}</strong></td></tr></tbody></table>
      ${(p.deductions || []).length ? `<table><thead><tr><th>Deductions</th><th class="n">Amount</th></tr></thead><tbody>${p.deductions.map((l) => `<tr><td>${esc(l.desc)}</td><td class="n">${esc(zar(l.amount))}</td></tr>`).join('')}<tr><td><strong>Total deductions</strong></td><td class="n"><strong>${esc(zar(p.deductionsTotal))}</strong></td></tr></tbody></table>` : ''}
      <div class="totals"><div class="grand"><span>Net pay</span><span>${esc(zar(p.net))}</span></div></div>${p.notes ? `<p>${br(p.notes)}</p>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- job costing
  const EXP_CAT = { materials: 'Materials', transport: 'Transport', subcontractor: 'Subcontractor', tools: 'Tools', other: 'Other' };
  const costOf = (job) => T.jobCosting({ job, invoices: S.invoices, expenses: S.expenses || [], labour: S.labour || [] });
  function viewCosting(a) {
    if (!isOwner()) return `<p class="muted">Job costing is for the owner. <a href="#/dashboard">Home</a></p>`;
    if (a) {
      const j = S.jobs.find((x) => x.id === a);
      if (!j) return `<p class="muted">Loading… <a href="#/costing">Back</a></p>`;
      const c = costOf(j);
      const exps = (S.expenses || []).filter((e) => e.jobId === j.id).sort((x, y) => (y.date > x.date ? 1 : -1));
      const lab = (S.labour || []).filter((l) => l.jobId === j.id);
      const byPerson = {};
      lab.forEach((l) => { byPerson[l.uid] ??= { hours: 0, cost: 0 }; byPerson[l.uid].hours += l.hours; byPerson[l.uid].cost += l.cost; });
      const invs = S.invoices.filter((i) => i.jobId === j.id && i.status !== 'draft');
      return `${back('#/costing', 'Costing')}<h2>${esc(j.title)}</h2><p class="muted">${esc(ctx.clientName(j.clientId))}</p>${profitCards(c)}
        <h3>Invoices (income)</h3>${invs.map((i) => `<a class="row" href="#/invoices/${esc(i.id)}"><div class="main"><div class="t">${esc(i.number)}</div></div><div class="r">${esc(zar(i.total))}</div>${badge(i.status)}</a>`).join('') || empty('No sent invoices linked to this job. Link invoices to the job to count the income.')}
        <h3>Labour</h3>${Object.entries(byPerson).map(([u, v]) => `<div class="row"><div class="main"><div class="t">${esc(nameOf(u))}</div><div class="s">${hrs(v.hours)}</div></div><div class="r">${esc(zar(Math.round(v.cost * 100) / 100))}</div></div>`).join('') || empty('No time logged against this job.')}
        <h3>Expenses</h3>${expenseList(exps, true)}${expenseForm(j.id)}`;
    }
    const rows = S.jobs.map((j) => ({ j, c: costOf(j) })).filter((r) => r.c.revenue || r.c.cost).sort((x, y) => y.c.profit - x.c.profit);
    const tot = rows.reduce((n, r) => ({ rev: n.rev + r.c.revenue, cost: n.cost + r.c.cost }), { rev: 0, cost: 0 });
    return `${head('Job costing')}<p class="muted">Income comes from sent and paid invoices linked to the job. Costs are expenses plus logged hours at each person's hourly cost.</p>
      <div class="grid"><div class="stat"><b>${esc(zar(tot.rev))}</b><span>Income</span></div><div class="stat"><b>${esc(zar(tot.rev - tot.cost))}</b><span>Profit (${rows.length} jobs)</span></div></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>Job</th><th>Income</th><th>Costs</th><th>Profit</th><th>Margin</th></tr></thead><tbody>${rows.map(({ j, c }) => `<tr><td><a href="#/costing/${esc(j.id)}">${esc(j.title)}</a></td><td>${esc(zar(c.revenue))}</td><td>${esc(zar(c.cost))}</td><td class="${c.profit < 0 ? 'err' : ''}">${esc(zar(c.profit))}</td><td>${c.marginPct === null ? '—' : c.marginPct + '%'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing to show yet. Log time, add expenses and link invoices to jobs.</td></tr>'}</tbody></table></div>`;
  }
  const profitCards = (c) => `<div class="grid"><div class="stat"><b>${esc(zar(c.revenue))}</b><span>Income (${esc(zar(c.paid))} paid)</span></div><div class="stat"><b>${esc(zar(c.cost))}</b><span>Costs: ${esc(zar(c.materials))} expenses + ${esc(zar(c.labour))} labour (${hrs(c.hours)})</span></div>
    <div class="stat"><b class="${c.profit < 0 ? 'err' : ''}">${esc(zar(c.profit))}</b><span>Profit${c.marginPct === null ? '' : ` · ${c.marginPct}% margin`}</span></div></div>`;
  const expenseList = (exps, showWho) => exps.map((e) => `<div class="row"><div class="main"><div class="t">${esc(e.description)}</div><div class="s">${esc(EXP_CAT[e.category] || e.category)} · ${esc(fmtDay(e.date))}${showWho ? ' · ' + esc(e.name) : ''}</div></div><div class="r">${esc(zar(e.amount))}</div>${isOwner() || e.uid === uid() ? `<button class="x" data-action="expense-delete" data-id="${esc(e.id)}" aria-label="Delete expense">×</button>` : ''}</div>`).join('') || empty('No expenses yet.');
  const expenseForm = (jobId) => `<details class="card"><summary><b>Add an expense</b></summary><form data-team="expense" data-job="${esc(jobId)}">
    ${fld('What was it', 'description', '', { required: true })}${fld('Amount (R)', 'amount', '', { type: 'number', required: true, attrs: 'min="0.01" step="0.01" inputmode="decimal"' })}
    ${fld('Type', 'category', 'materials', { type: 'select', options: Object.entries(EXP_CAT) })}${fld('Date', 'date', today(), { type: 'date', required: true })}<button class="btn primary">Add expense</button></form></details>`;
  /** Shown under a job: expenses for everyone, income/profit for the owner. */
  function jobExtras(job) {
    if (!has('jobCosting')) return '';
    const exps = (S.expenses || []).filter((e) => e.jobId === job.id).sort((x, y) => (y.date > x.date ? 1 : -1));
    const hours = (S.timeEntries || []).filter((e) => e.jobId === job.id).reduce((n, e) => n + (e.hours || 0), 0);
    return `<div class="card"><h3>Costs on this job</h3>${isOwner() ? profitCards(costOf(job)) + `<p><a href="#/costing/${esc(job.id)}">Full costing breakdown</a></p>` : `<p class="muted">${hrs(hours)} logged by people you can see.</p>`}
      ${expenseList(exps, true)}${expenseForm(job.id)}</div>`;
  }

  // ---------------------------------------------------------------- reports
  const RANGES = { month: ['This month', () => today().slice(0, 8) + '01'], last30: ['Last 30 days', () => daysAgoKey(29)], week: ['This week', weekStart], last7: ['Last 7 days', () => daysAgoKey(6)] };
  function reportRows() {
    const from = RANGES[S.q.reportRange || 'month'][1]();
    return myTeam().map((m) => {
      const hours = (S.timeEntries || []).filter((e) => e.uid === m.uid && e.date >= from).reduce((n, e) => n + (e.hours || 0), 0);
      const tasks = (S.tasks || []).filter((t) => t.assigneeId === m.uid);
      return {
        name: m.name, role: T.ROLE_LABEL[m.role], hours: Math.round(hours * 100) / 100,
        done: tasks.filter((t) => t.status === 'done' && (t.completedAt || 0) >= Date.parse(from + 'T00:00:00+02:00')).length,
        open: tasks.filter((t) => t.status !== 'done').length, overdue: tasks.filter((t) => T.taskIsOverdue(t)).length,
        leave: (S.leave || []).filter((r) => r.uid === m.uid && r.status === 'approved' && r.to >= from).reduce((n, r) => n + r.days, 0),
      };
    });
  }
  function viewReports() {
    if (!isMgr()) return `<p class="muted">Reports are for managers. <a href="#/dashboard">Home</a></p>`;
    const rows = reportRows();
    return `${head('Team report', '<button class="btn" data-action="export-hours">Export CSV</button>')}
      <div class="seg">${Object.entries(RANGES).map(([k, [l]]) => `<button class="${(S.q.reportRange || 'month') === k ? 'on' : ''}" data-action="report-range" data-range="${k}">${l}</button>`).join('')}</div>
      <div class="scroll"><table class="tbl"><thead><tr><th>Person</th><th>Hours</th><th>Tasks done</th><th>Open</th><th>Overdue</th><th>Leave days</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.name)}<br><span class="muted">${esc(r.role)}</span></td><td>${r.hours}</td><td>${r.done}</td><td>${r.open}</td><td class="${r.overdue ? 'err' : ''}">${r.overdue}</td><td>${r.leave}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No people yet.</td></tr>'}</tbody></table></div>
      ${isOwner() ? `<p><a class="btn" href="#/costing">Job profitability →</a></p>` : ''}
      <p class="muted">Shows the people below you in the hierarchy${isOwner() ? ' (everyone, for the owner)' : ''}.</p>`;
  }

  // ---------------------------------------------------------------- router glue
  function view(page, a) {
    if (page !== 'chat') leaveChatPage();
    if (!has('hierarchy')) return `<div class="card"><h3>Business plan</h3><p class="muted">Team features are part of the Business plan.</p>${isOwner() ? '<a class="btn primary" href="#/billing">See plans</a>' : ''}</div>`;
    switch (page) {
      case 'tasks': return viewTasks(a);
      case 'team': return viewTeam(a);
      case 'docs': return viewDocs(a);
      case 'time': return viewTime();
      case 'leave': return viewLeave();
      case 'chat': return viewChat(a);
      case 'payroll': return viewPayroll(a);
      case 'costing': return viewCosting(a);
      case 'reports': return viewReports();
      case 'library': case 'support': return BIZ.view(page, a);
      case 'calendar': return CAL.view(a);
      default: return '';
    }
  }

  // ---------------------------------------------------------------- actions (buttons)
  const val = (f, n) => (f.elements[n]?.value ?? '').trim();
  const checked = (f, name) => [...f.querySelectorAll(`input[name=${name}]:checked`)].map((i) => i.value);
  const actions = {
    ...BIZ.actions,
    ...CAL.actions,
    'team-tab'(el) { S.q.teamTab = el.dataset.tab; render(); },
    'tasks-tab'(el) { S.q.tasksTab = el.dataset.tab; render(); },
    'tasks-status'(el) { S.q.tasksStatus = el.dataset.status; render(); },
    'report-range'(el) { S.q.reportRange = el.dataset.range; render(); },
    async 'task-status'(el) { await call('updateTask', { id: el.dataset.id, data: { status: el.dataset.status } }); toast('Updated'); },
    async 'task-delete'(el) { if (!confirm('Delete this task?')) return; await call('deleteTask', { id: el.dataset.id }); nav('#/tasks'); toast('Task deleted'); },
    async 'doc-ack'(el) { await call('ackDoc', { id: el.dataset.id }); toast('Thanks, confirmed'); },
    async 'doc-delete'(el) { if (!confirm('Remove this document for everyone?')) return; await call('deleteDoc', { id: el.dataset.id }); nav('#/docs'); },
    async 'timer-stop'(el) { const r = await call('stopTimer', { id: el.dataset.id }); toast(`Logged ${hrs(r.hours)}${r.capped ? ' (capped at 16 hours, please check)' : ''}`); },
    async 'time-delete'(el) { if (!confirm('Delete this time entry?')) return; await call('deleteTime', { id: el.dataset.id }); },
    async 'leave-approve'(el) { await call('decideLeave', { id: el.dataset.id, decision: 'approved' }); toast('Approved'); },
    async 'leave-decline'(el) { const note = prompt('Reason (optional)'); if (note === null) return; await call('decideLeave', { id: el.dataset.id, decision: 'declined', note }); toast('Declined'); },
    async 'leave-cancel'(el) { if (!confirm('Cancel this leave request?')) return; await call('cancelLeave', { id: el.dataset.id }); toast('Cancelled'); },
    async 'chat-leave'(el) { if (!confirm('Leave this group?')) return; await call('leaveChat', { chatId: el.dataset.id }); nav('#/chat'); },
    async 'member-status'(el) {
      const off = el.dataset.status === 'inactive';
      if (off && !confirm('Switch off this person’s access now?')) return;
      await call('updateMember', { data: { uid: el.dataset.id, status: el.dataset.status } });
      toast(off ? 'Access switched off' : 'Access restored');
    },
    async 'expense-delete'(el) { if (!confirm('Delete this expense?')) return; await call('deleteExpense', { id: el.dataset.id }); },
    'ps-add-line'(el) { document.getElementById(el.dataset.kind).insertAdjacentHTML('beforeend', lineRow(el.dataset.kind)); },
    'ps-del-line'(el) { el.closest('.item').remove(); },
    async 'ps-delete'(el) { if (!confirm('Delete this draft payslip?')) return; await call('deletePayslip', { id: el.dataset.id }); nav('#/payroll'); },
    async 'copy-link'() { const t = document.getElementById('invite-link')?.textContent || ''; try { await navigator.clipboard.writeText(t); toast('Link copied'); } catch { toast('Select the link and copy it', true); } },
    'export-hours'() {
      const rows = reportRows();
      const cols = [{ label: 'Person', get: (r) => r.name }, { label: 'Role', get: (r) => r.role }, { label: 'Hours', get: (r) => r.hours }, { label: 'Tasks done', get: (r) => r.done }, { label: 'Open tasks', get: (r) => r.open }, { label: 'Overdue', get: (r) => r.overdue }, { label: 'Leave days', get: (r) => r.leave }];
      const blob = new Blob(['﻿' + L.toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `team-report-${today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  // ---------------------------------------------------------------- forms
  async function submit(f, kind, intent) {
    const id = f.dataset.id || '';
    switch (kind) {
      case 'task': {
        const data = { title: val(f, 'title'), assigneeId: val(f, 'assigneeId'), dueAt: L.fromDateInput(val(f, 'dueAt')), priority: val(f, 'priority'), jobId: val(f, 'jobId') || null, description: val(f, 'description') };
        if (id) { await call('updateTask', { id, data }); toast('Saved'); } else { const r = await call('createTask', { data }); toast('Task created'); nav('#/tasks/' + r.id); }
        break;
      }
      case 'comment': await call('updateTask', { id, comment: val(f, 'text') }); f.reset(); break;
      case 'doc': {
        const aud = val(f, 'audience');
        const data = { title: val(f, 'title'), kind: val(f, 'kind'), body: val(f, 'body'), link: val(f, 'link'), requireAck: f.elements.requireAck.checked, audience: aud === 'pick' ? { uids: checked(f, 'uid') } : aud };
        if (aud === 'pick' && !data.audience.uids.length) throw new Error('Tick at least one person.');
        const r = await call('createDoc', { data }); toast(`Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}`); nav('#/docs');
        break;
      }
      case 'timer-start': await call('startTimer', { jobId: val(f, 'jobId') || null, note: val(f, 'note') }); toast('Timer started'); break;
      case 'time-manual': await call('addTime', { data: { date: val(f, 'date'), hours: Number(val(f, 'hours')), jobId: val(f, 'jobId') || null, note: val(f, 'note') } }); toast('Time added'); f.reset(); break;
      case 'leave': {
        const r = await call('requestLeave', { data: { type: val(f, 'type'), from: val(f, 'from'), to: val(f, 'to'), note: val(f, 'note') } });
        toast(r.status === 'approved' ? `Leave recorded (${r.days} days)` : `Request sent (${r.days} working days)`);
        break;
      }
      case 'leave-allowance': await D.saveTeamSettings(S.tid, { leaveAllowance: { annual: Number(val(f, 'annual')), sick: Number(val(f, 'sick')), family: Number(val(f, 'family')) } }); toast('Saved'); break;
      case 'chat-new': {
        const memberIds = checked(f, 'uid');
        if (!memberIds.length) throw new Error('Pick at least one person.');
        const r = await call('createChat', { data: { name: val(f, 'name'), memberIds } }); nav('#/chat/' + r.id);
        break;
      }
      case 'msg': { const text = val(f, 'text'); if (!text) return; f.reset(); await call('sendMessage', { chatId: id, text }); break; }
      case 'chat-add': { if (!val(f, 'uid')) throw new Error('Choose someone.'); await call('addChatMembers', { chatId: id, uids: [val(f, 'uid')] }); toast('Added'); break; }
      case 'invite': {
        const data = { name: val(f, 'name'), email: val(f, 'email'), phone: val(f, 'phone'), role: val(f, 'role'), managerId: val(f, 'managerId') || null, department: val(f, 'department'), hourlyRate: val(f, 'hourlyRate') === '' ? 0 : Number(val(f, 'hourlyRate')) };
        const r = await call('invite', { data });
        D.resetPassword(data.email).catch(() => {}); // Firebase emails the set-password link too
        S.lastInvite = { name: data.name, link: r.link };
        toast('Person added'); render();
        break;
      }
      case 'member-edit': {
        const data = { uid: id, name: val(f, 'name'), phone: val(f, 'phone'), role: val(f, 'role'), managerId: val(f, 'managerId'), department: val(f, 'department'), hourlyRate: Number(val(f, 'hourlyRate') || 0) };
        await call('updateMember', { data }); toast('Saved');
        break;
      }
      case 'payslip': {
        const data = { employeeId: val(f, 'employeeId'), period: val(f, 'period'), earnings: readLines(f, 'earn'), deductions: readLines(f, 'ded'), notes: val(f, 'notes') };
        const r = await call('savePayslip', { data, ...(id ? { id } : {}) });
        if (intent === 'issue') { if (!confirm('Issue this payslip? It will be locked and the employee can see it.')) { nav('#/payroll/' + r.id); return; } await call('issuePayslip', { id: r.id }); toast('Payslip issued'); } else toast('Draft saved');
        nav('#/payroll');
        break;
      }
      case 'expense': await call('addExpense', { data: { jobId: f.dataset.job, description: val(f, 'description'), amount: Number(val(f, 'amount')), category: val(f, 'category'), date: val(f, 'date') } }); toast('Expense added'); f.reset(); break;
      default:
        if (BIZ.owns(kind)) return BIZ.submit(f, kind, intent);
        if (CAL.owns(kind)) return CAL.submit(f, kind, intent);
        throw new Error('Unknown form');
    }
  }

  // Keep the running timer ticking without a full re-render.
  setInterval(() => {
    const el = document.getElementById('elapsed');
    if (!el) return;
    const ms = Date.now() - Number(el.dataset.since);
    const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    el.textContent = `${h}h ${String(m).padStart(2, '0')}m`;
  }, 15000);

  return { navItems, isTeamPage, homeCards, attention, employeeHome, upcomingCard: CAL.upcomingCard, canPost: CAL.canPost, view, actions, submit, jobExtras, payslipDoc, leaveChatPage };
}
