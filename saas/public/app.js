import * as D from './data.js';
import * as L from './lib.js';
import { PLANS, PRICING, trialState, formatPrice } from './shared/plans.js';
import { BRAND, PLATFORM_NAME, logoSvg, applyBrand } from './brand.js';
import { icon, PAGE_ICON, avatar, shrinkImage, greeting, kpi, areaChart } from './ui.js';
import * as T from './shared/team.js';
import { createTeamUI } from './team-ui.js';

const { esc, zar } = L;
const $ = (s, r = document) => r.querySelector(s);
const $app = $('#app');
const KEYS = D.KEYS; // clients, quotes, jobs, certificates, invoices

// Tells the "could not start" watchdog in index.html that a real screen is showing.
new MutationObserver(() => { if (!$app.querySelector('.pad')) window.__appReady = true; }).observe($app, { childList: true });

applyBrand();

const S = {
  user: null, tid: null, role: null, tenant: null, profile: {}, usage: {},
  members: [], tasks: [], workDocs: [], timeEntries: [], leave: [], expenses: [], payslips: [], library: [], tickets: [], libSettings: {}, supportSettings: {}, events: [], calSettings: {}, myMember: null, moreOpen: false, bellOpen: false, chats: [], labour: [], rates: {}, teamSettings: {}, messages: {}, lastInvite: null,
  clients: [], quotes: [], jobs: [], certificates: [], invoices: [],
  q: {}, draft: null, draftKey: null, error: null, unsub: null,
};

const ENT = {
  clients: { singular: 'Client', plural: 'Clients' },
  quotes: { singular: 'Quote', plural: 'Quotes' },
  jobs: { singular: 'Job', plural: 'Jobs' },
  certificates: { singular: 'Certificate', plural: 'Certificates' },
  invoices: { singular: 'Invoice', plural: 'Invoices' },
};
const NAV_KEYS = () => TEAM.navItems().map(([k]) => k);

// ---------------------------------------------------------------- helpers
const client = (id) => S.clients.find((c) => c.id === id) || {};
const cn = (id) => client(id).name || '—';
const has = (f) => !!S.tenant?.entitlements?.features?.includes(f);
const nav = (h) => { location.hash = h; };
const badge = (s) => { if (!s) return ''; const t = String(s).replace(/_/g, ' '); return `<span class="badge b-${esc(s)}">${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span>`; };
// The server counts every job it creates this month (deleting one doesn't free a slot), so trust the larger number.
const jobsUsed = () => { const ms = L.startOfMonth(); return Math.max(S.jobs.filter((j) => j.createdAt >= ms).length, S.usage?.jobs || 0); };
const planLabel = (t) => PLANS[t]?.label || t;
const TEAM = createTeamUI({ S, D, L, esc, zar, fld: (...a) => fld(...a), badge, toast, nav, has, render: () => render(), platformName: PLATFORM_NAME, clientName: (id) => cn(id) });

function toast(msg, bad) {
  document.querySelectorAll('.toast').forEach((t) => t.remove()); // one at a time, or they draw over each other
  const d = document.createElement('div');
  d.className = 'toast' + (bad ? ' bad' : '');
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3800);
}

function route() {
  const [page = 'dashboard', a, b] = location.hash.replace(/^#\/?/, '').split('/');
  return { page, a, b };
}
const isFormRoute = () => { const { page, a } = route(); return (KEYS.includes(page) && !!a) || page === 'settings'; };

// ---------------------------------------------------------------- auth screens
function renderAuth(mode = 'in') {
  $app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><div class="auth-logo">${logoSvg(52)}</div><h1>${esc(PLATFORM_NAME)}</h1>
    <p class="muted">${esc(BRAND.tagline)}</p>
    <form data-auth="${mode}">
      <label class="f"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="f"><span>Password</span><input name="password" type="password" required minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></label>
      <button class="btn primary wide">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
    </form>
    <p class="center">${mode === 'in'
      ? `New here? <a href="#" data-action="auth-mode" data-mode="up">Create an account</a><br><a href="#" data-action="reset">Forgot password?</a>`
      : `Have an account? <a href="#" data-action="auth-mode" data-mode="in">Sign in</a>`}</p></div></div>`;
}

function renderOnboarding() {
  $app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><div class="auth-logo">${logoSvg(52)}</div><h1>Set up your business</h1>
    <p class="muted">You can change the details on your documents later in Settings.</p>
    <form data-onboard>
      <label class="f"><span>Your name</span><input name="ownerName" required minlength="2" maxlength="60" autocomplete="name" placeholder="e.g. Thabo Mokoena"></label>
      <label class="f"><span>Business name</span><input name="name" required minlength="2" maxlength="80" autocomplete="organization"></label>
      <button class="btn primary wide">Create business</button>
    </form>
    <p class="center"><a href="#" data-action="logout">Sign out</a></p></div></div>`;
}

const authMsg = (err) => {
  const c = err?.code || '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(c)) return 'Wrong email or password.';
  if (c === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
  if (c === 'auth/weak-password') return 'Use at least 6 characters.';
  if (c === 'auth/too-many-requests') return 'Too many attempts. Try again in a few minutes.';
  return err?.message || 'Something went wrong.';
};

// ---------------------------------------------------------------- boot
async function boot(user) {
  S.unsub?.(); S.unsub = null;
  TEAM.leaveChatPage();
  Object.assign(S, { user, tid: null, role: null, tenant: null, profile: {}, usage: {}, error: null, trialChecked: false, myMember: null, events: [], calSettings: {}, moreOpen: false, bellOpen: false, library: [], tickets: [], libSettings: {}, supportSettings: {}, members: [], tasks: [], workDocs: [], timeEntries: [], leave: [], expenses: [], payslips: [], chats: [], labour: [], rates: {}, teamSettings: {}, messages: {}, lastInvite: null, clients: [], quotes: [], jobs: [], certificates: [], invoices: [] });
  if (!user) return renderAuth('in');

  const t = await user.getIdTokenResult(true); // force-refresh so new claims are picked up
  if (!t.claims.tenantId) return renderOnboarding();

  S.tid = t.claims.tenantId;
  S.role = t.claims.role || 'owner';
  S.unsub = D.listen(S.tid, (patch) => {
    Object.assign(S, patch);
    if (patch.error) console.error(patch.error);
    // Never rebuild a form the user is typing in.
    const el = document.activeElement;
    const typing = el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.closest('form[data-team]');
    if (typing) return;
    if (!isFormRoute() || !$('form[data-form]')) render();
  }, { uid: user.uid, role: S.role });
  if (S.role !== 'owner') D.api('/api/team', { action: 'hello' }).catch(() => {}); // marks an invited person as active

  if (location.pathname === '/billing/complete' || new URLSearchParams(location.search).get('billing') === 'complete') {
    history.replaceState(null, '', '/#/billing');
    toast('Payment received. Your plan updates in a moment.');
  } else if (!location.hash) {
    location.hash = '#/dashboard';
  }
  render();
}

// ---------------------------------------------------------------- render
const uid = () => S.user?.uid;
const myMem = () => S.members.find((m) => m.uid === uid()) || S.myMember || { uid: uid(), name: S.user?.displayName || S.user?.email || 'You', role: S.role };
const firstName = () => String(myMem().name || '').trim().split(/\s+/)[0] || 'there';
const roleLabel = (r) => T.ROLE_LABEL[r] || r;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const longDate = () => new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date());

function brandMark(size) {
  const logo = L.safeUrl(S.tenant.branding?.logoUrl);
  if (has('whiteLabel')) return logo ? `<img class="logo" src="${esc(logo)}" alt="" width="${size}" height="${size}" style="object-fit:contain;border-radius:8px">` : '';
  return logoSvg(size);
}

/** Things that need this person's attention, shown under the bell and as counts in the menu. */
function attention() {
  const out = [];
  const now = Date.now();
  if (S.role !== 'employee') {
    const od = S.invoices.filter((i) => L.isOverdue(i, now));
    if (od.length) out.push({ key: 'invoices', ic: 'receipt', text: `${plural(od.length, 'overdue invoice')}`, sub: `${zar(od.reduce((n, i) => n + (i.total || 0), 0))} waiting to be paid`, href: '#/invoices', warn: true, n: od.length });
  }
  out.push(...TEAM.attention());
  return out;
}

function shell(page, body) {
  const t = S.tenant;
  const name = t.branding?.displayName || t.name;
  const tr = trialState(t);
  const trialBanner = tr.active
    ? `<div class="banner">Free trial of ${tr.tier === 'business' ? 'Business' : 'Standard'}: <b>${tr.daysLeft} day${tr.daysLeft === 1 ? '' : 's'} left</b>. <a href="#/billing">Subscribe to keep it</a>.</div>`
    : t.trial && t.trial.active === false && t.trial.endedAt && t.tier === 'free' && Date.now() - t.trial.endedAt < 14 * 864e5
      ? `<div class="banner">Your 30-day trial has ended and you are on the Free plan. <a href="#/billing">Subscribe</a> for unlimited jobs and more.</div>` : '';
  const banner = (t.status === 'past_due'
    ? `<div class="banner bad">Your last payment failed. <a href="#/billing">Check your billing</a> to keep your plan.</div>` : '') + trialBanner;

  const items = TEAM.navItems();
  const att = attention();
  const badgeOf = (k) => att.filter((a) => a.key === k).reduce((n, a) => n + (a.n || 0), 0);
  const total = att.reduce((n, a) => n + (a.n || 0), 0);
  const me = myMem();
  const groupOf = (k) => (['tasks', 'calendar', 'chat', 'team', 'time', 'leave', 'docs', 'library', 'support'].includes(k) || (k === 'payroll' && S.role === 'employee') ? 'Team' : ['payroll', 'costing', 'reports', 'billing', 'settings'].includes(k) ? 'Business' : 'Work');
  let last = '';
  const side = items.map(([k, l]) => {
    const g = groupOf(k);
    const head = g !== last && items.length > 6 ? `<div class="side-group">${g}</div>` : '';
    last = g;
    const n = badgeOf(k);
    return `${head}<a href="#/${k}" class="${k === page ? 'on' : ''}" ${k === page ? 'aria-current="page"' : ''}>${icon(PAGE_ICON[k] || 'dashboard')}<span>${esc(l)}</span>${n ? `<span class="n">${n}</span>` : ''}</a>`;
  }).join('');

  // phone: four shortcuts that exist for this person, then "More"
  const keys = items.map(([k]) => k);
  const pick = (...c) => c.find((k) => keys.includes(k));
  const slots = [pick('dashboard'), pick('tasks', 'jobs'), pick('chat', 'quotes', 'clients'), pick('calendar', 'invoices', 'certificates')].filter(Boolean);
  const labelOf = (k) => (items.find(([x]) => x === k) || [])[1] || k;
  const tabbar = `<nav class="tabbar" aria-label="Main">${slots.map((k) => `<a href="#/${k}" class="${k === page ? 'on' : ''}">${icon(PAGE_ICON[k] || 'dashboard', 22)}<span>${esc(labelOf(k))}</span></a>`).join('')}<button data-action="more" class="${S.moreOpen ? 'on' : ''}">${icon('more', 22)}<span>More</span></button></nav>`;
  const sheet = S.moreOpen ? `<div class="sheet-back" data-action="more-close"><div class="sheet" role="dialog" aria-label="All pages"><div class="grab"></div>
    <a class="sheet-me" href="#/profile" style="text-decoration:none;color:inherit">${avatar(me, 'lg')}<div><div class="nm">${esc(me.name || '')}</div><div class="muted">${esc(roleLabel(me.role || S.role))} · ${esc(name)}</div></div></a>
    <div class="sheet-grid">${items.map(([k, l]) => `<a href="#/${k}">${icon(PAGE_ICON[k] || 'dashboard', 22)}<span>${esc(l)}</span></a>`).join('')}<a href="#/profile">${icon('user', 22)}<span>My profile</span></a><a href="#" data-action="logout">${icon('logout', 22)}<span>Sign out</span></a></div></div></div>` : '';
  const bell = S.bellOpen ? `<div class="bell-panel" role="dialog" aria-label="Notifications"><h4>Needs your attention</h4>${att.length
    ? att.map((a) => `<a class="bell-item ${a.warn ? 'warn' : ''}" href="${esc(a.href)}"><span class="bi">${icon(a.ic, 18)}</span><span><b>${esc(a.text)}</b><small>${esc(a.sub || '')}</small></span></a>`).join('')
    : '<div class="bell-empty">You are all caught up.</div>'}</div>` : '';

  return `<div class="app">
    <aside class="sidebar"><div class="side-brand">${brandMark(34)}<span>${esc(has('whiteLabel') ? name : PLATFORM_NAME)}</span></div>
      <nav class="side-nav" aria-label="Main">${side}</nav>
      <div class="side-foot"><a class="av-link" href="#/profile" aria-label="My profile">${avatar(me, 'md')}</a><a class="who" href="#/profile"><b>${esc(me.name || '')}</b><span>${esc(name)} · ${esc(roleLabel(me.role || S.role))}</span></a><button class="icon-btn" data-action="logout" aria-label="Sign out" title="Sign out">${icon('logout', 18)}</button></div></aside>
    <div class="col">
      <header class="topbar">${brandMark(30)}<div class="t-name">${esc(name)}</div>
        <form class="t-search" data-search>${icon('search', 18)}<input name="q" type="search" placeholder="Search clients, quotes, invoices…" aria-label="Search" required></form>
        <span class="t-spacer"></span><span class="pill">${esc(planLabel(t.tier))}</span>
        <a class="icon-btn t-searchbtn" href="#/search" aria-label="Search">${icon('search')}</a>
        <button class="icon-btn" data-action="bell" aria-label="Notifications" aria-expanded="${S.bellOpen}">${icon('bell')}${total ? `<span class="dot">${total > 99 ? '99+' : total}</span>` : ''}</button>
        <a class="me-btn" href="#/profile" aria-label="My profile">${avatar(me, 'md')}</a></header>
      ${bell}
      <main class="page">${banner}${body}</main></div>
    ${tabbar}${sheet}</div>`;
}

function render() {
  if (!S.tid) return;
  if (S.error && !S.tenant) {
    $app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><p class="err">Couldn't load your business: ${esc(S.error.message)}</p><button class="btn" data-action="logout">Sign out</button></div></div>`;
    return;
  }
  if (!S.tenant) { $app.innerHTML = '<div class="center muted pad">Loading…</div>'; return; }
  // A trial that has run out is ended by the server; the live listener then updates the plan.
  if (S.tenant.trial?.active && S.tenant.trial.endsAt <= Date.now() && !S.trialChecked) {
    S.trialChecked = true;
    D.api('/api/tenant', { action: 'checkTrial' }).catch(() => { S.trialChecked = false; });
  }
  if (['suspended', 'cancelled'].includes(S.tenant.status)) {
    $app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>Account ${esc(S.tenant.status)}</h1><p class="muted">Please contact support to restore access. Your data is safe.</p><button class="btn" data-action="logout">Sign out</button></div></div>`;
    return;
  }
  if (S.role !== 'owner' && !has('hierarchy')) {
    $app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>${esc(S.tenant.name)}</h1><p class="muted">This business is not on the Business plan right now, so team access is paused. Please ask the owner.</p><button class="btn" data-action="logout">Sign out</button></div></div>`;
    return;
  }
  const c = S.tenant.branding?.primaryColor;
  document.documentElement.style.setProperty('--brand', /^#[0-9a-f]{6}$/i.test(c || '') ? c : BRAND.color);

  const { page, a, b } = route();
  if (page === 'print') return renderPrint(a, b);

  const keepSide = $('.side-nav')?.scrollTop || 0;
  const th0 = $('#msgs');
  const thread = th0 ? { top: th0.scrollTop, bottom: th0.scrollHeight - th0.scrollTop - th0.clientHeight < 80, id: S.msgSub?.id } : null;
  let body;
  try { body = view(page, a); } catch (e) { console.error(e); body = `<p class="err">${esc(e.message)}</p>`; }
  $app.innerHTML = shell(page, body);
  const sn = $('.side-nav');
  if (sn) sn.scrollTop = keepSide;
  const th1 = $('#msgs');
  if (th1) th1.scrollTop = !thread || thread.id !== S.msgSub?.id || thread.bottom ? th1.scrollHeight : thread.top; // a new chat opens at the newest message
  afterRender();
}

function view(page, a) {
  if (['dashboard', 'search', 'print', 'profile'].includes(page) === false && !NAV_KEYS().includes(page)) { page = 'dashboard'; a = undefined; }
  if (TEAM.isTeamPage(page)) return TEAM.view(page, a);
  TEAM.leaveChatPage();
  if (KEYS.includes(page)) {
    if (!a) { S.draft = null; return viewList(page); }
    return viewForm(page, a);
  }
  if (page === 'billing') return viewBilling();
  if (page === 'settings') return viewSettings();
  if (page === 'profile') return viewProfile();
  if (page === 'search') return viewSearch(decodeURIComponent(a || ''));
  return viewDashboard();
}

// ---------------------------------------------------------------- dashboard + search
const remindText = (i) => `Hi ${cn(i.clientId)}, a friendly reminder that invoice ${i.number} for ${zar(i.total)} was due on ${L.fmtDate(i.dueAt)}. Thank you!`;
const renewText = (c) => `Hi ${cn(c.clientId)}, your ${L.CERT_TYPES[c.type]?.label || 'certificate'} (${c.number}) is due for renewal on ${L.fmtDate(c.renewAt)}. Reply to book an inspection.`;
const waBtn = (phone, text, label) => `<a class="btn sm" target="_blank" rel="noopener" href="${esc(L.waLink(phone, text))}">${label}</a>`;
const shortDay = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ago = (ms) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 6e4));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return m < 2880 ? 'yesterday' : L.fmtDate(ms);
};

/** The chart on the dashboard: tasks finished per day, or money received per month. */
function chartCard() {
  const hier = has('hierarchy');
  const tabs = [...(hier ? [['tasks', 'Tasks done']] : []), ['income', 'Income']];
  const kind = tabs.some(([k]) => k === S.q.chart) ? S.q.chart : tabs[0][0];
  const now = Date.now();
  let pts, title, sub, opts = {};
  if (kind === 'tasks') {
    const keys = Array.from({ length: 14 }, (_, i) => L.dateKeySAST(now - (13 - i) * 864e5));
    const by = {};
    S.tasks.filter((t) => t.status === 'done' && t.completedAt).forEach((t) => { const k = L.dateKeySAST(t.completedAt); by[k] = (by[k] || 0) + 1; });
    pts = keys.map((k) => ({ label: shortDay(k), v: by[k] || 0 }));
    title = 'Task completion'; sub = `${pts.reduce((n, p) => n + p.v, 0)} tasks finished in the last 14 days`; opts = { unit: 'done' };
  } else {
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return L.monthKeySAST(d.getTime() + 864e5 * 2); });
    const by = {};
    S.invoices.filter((i) => i.status === 'paid' && i.paidAt).forEach((i) => { const k = L.monthKeySAST(i.paidAt); by[k] = (by[k] || 0) + (i.total || 0); });
    pts = months.map((k) => ({ label: new Date(`${k}-15T12:00:00Z`).toLocaleDateString('en-ZA', { month: 'short', timeZone: 'UTC' }), v: Math.round((by[k] || 0) * 100) / 100 }));
    title = 'Income received'; sub = `${zar(pts.reduce((n, p) => n + p.v, 0))} from paid invoices in the last 6 months`; opts = { money: true };
  }
  return `<div class="card"><div class="card-h"><div><h3>${title}</h3><div class="kpi-s">${esc(sub)}</div></div>${tabs.length > 1 ? `<div class="viewsw">${tabs.map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-action="chart-kind" data-kind="${k}">${l}</button>`).join('')}</div>` : ''}</div>${areaChart(pts, opts)}</div>`;
}

/** The newest things that happened, built from the live records this person can see. */
function activityFeed() {
  const memOf = (id) => S.members.find((m) => m.uid === id);
  const ev = [];
  const add = (at, who, text, href, ic = 'check') => { if (at) ev.push({ at, who, text, href, ic }); };
  S.tasks.forEach((t) => {
    if (t.status === 'done' && t.completedAt) add(t.completedAt, memOf(t.assigneeId), `<b>${esc(memOf(t.assigneeId)?.name || 'Someone')}</b> completed ${esc(t.title)}`, `#/tasks/${t.id}`, 'tasks');
    add(t.createdAt, memOf(t.createdBy), `<b>${esc(t.createdByName || memOf(t.createdBy)?.name || 'Someone')}</b> added a task: ${esc(t.title)}`, `#/tasks/${t.id}`, 'tasks');
  });
  S.workDocs.forEach((d) => add(d.createdAt, memOf(d.createdBy), `<b>${esc(d.createdByName)}</b> sent ${esc(d.title)}`, `#/docs/${d.id}`, 'file'));
  S.library.filter((d) => d.status === 'ready').forEach((d) => add(d.createdAt, memOf(d.uploaderId), `<b>${esc(d.uploaderName)}</b> added ${esc(d.title)} to the library`, `#/library/${d.id}`, 'folder'));
  S.events.forEach((e) => add(e.createdAt, memOf(e.createdBy), `<b>${esc(e.createdByName)}</b> added the event ${esc(e.title)}`, '#/calendar', 'calendar'));
  S.tickets.forEach((t) => add(t.createdAt, null, `New inquiry from <b>${esc(t.name)}</b>: ${esc(t.subject)}`, `#/support/${t.id}`, 'support'));
  S.leave.forEach((r) => add(r.createdAt, memOf(r.uid), `<b>${esc(r.name)}</b> ${r.status === 'pending' ? 'asked for' : 'booked'} ${esc((T.LEAVE_TYPES[r.type] || 'leave').toLowerCase())}`, '#/leave', 'sun'));
  S.jobs.forEach((j) => add(j.createdAt, null, `New job: <b>${esc(j.title)}</b>`, `#/jobs/${j.id}`, 'briefcase'));
  S.invoices.forEach((i) => { if (i.status === 'paid' && i.paidAt) add(i.paidAt, null, `Invoice <b>${esc(i.number)}</b> was paid (${esc(zar(i.total))})`, `#/invoices/${i.id}`, 'receipt'); });
  S.quotes.forEach((q) => { if (q.status === 'approved' && q.approvedAt) add(q.approvedAt, null, `Quote <b>${esc(q.number)}</b> was approved`, `#/quotes/${q.id}`, 'file'); });
  S.certificates.forEach((c) => { if (c.status === 'issued' && c.issuedAt) add(c.issuedAt, null, `Certificate <b>${esc(c.number)}</b> was issued`, `#/certificates/${c.id}`, 'shield'); });
  const top = ev.sort((x, y) => y.at - x.at).slice(0, 6);
  return `<div class="card"><div class="card-h"><h3>Recent activity</h3></div>${top.length
    ? `<ul class="feed">${top.map((e) => `<li>${e.who ? avatar(e.who, 'md') : `<span class="kpi-ic" style="width:36px;height:36px;border-radius:99px">${icon(e.ic, 17)}</span>`}<a class="tx" href="${esc(e.href)}" style="color:inherit;text-decoration:none">${e.text}</a><span class="tm">${esc(ago(e.at))}</span></li>`).join('')}</ul>`
    : '<div class="empty" style="border:0;padding:1.4rem 0">Nothing yet. Things you and your team do will show up here.</div>'}</div>`;
}

function viewDashboard() {
  if (S.role === 'employee') return TEAM.employeeHome();
  const now = Date.now();
  const hier = has('hierarchy');
  const used = jobsUsed();
  const lim = L.jobsLimitState(S.tenant.entitlements.limits, used);
  const unpaid = S.invoices.filter((i) => i.status === 'sent');
  const outstanding = unpaid.reduce((a, i) => a + (i.total || 0), 0);
  const overdue = unpaid.filter((i) => L.isOverdue(i, now));
  const quotesOpen = S.quotes.filter((q) => q.status === 'sent').length;
  const renewals = S.certificates
    .filter((c) => c.status === 'issued' && c.renewAt && c.renewAt <= now + 30 * 864e5)
    .sort((x, y) => x.renewAt - y.renewAt);

  const limitBanner = !lim.unlimited && lim.remaining <= 1
    ? `<div class="banner">${lim.reached ? `You've used all ${lim.max} jobs this month.` : `1 job left this month.`} <a href="#/billing">Upgrade for unlimited jobs</a>.</div>` : '';
  const hint = S.clients.length === 0
    ? `<div class="card"><b>Start here</b><p class="muted">Add your first client, then create a quote.</p><a class="btn primary" href="#/clients/new">Add a client</a></div>` : '';
  const nudge = !myMem().photo && !dismissed('nudge')
    ? `<div class="banner" style="background:var(--brand-soft);border-color:var(--brand-line);color:var(--ink);display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">${icon('camera', 20)}<span style="flex:1">Make it yours: add your name and a profile picture so your team recognises you.</span><a class="btn sm primary" href="#/profile">Add picture</a><button class="link" data-action="dismiss-nudge">Not now</button></div>` : '';

  const rem = (title, rows) => rows.length ? `<div class="card"><div class="card-h"><h3>${title}</h3></div>${rows.join('')}</div>` : '';
  const quick = [
    ['quotes/new', 'file', 'New quote', 'Price a job'], ['jobs/new', 'briefcase', 'New job', 'Schedule work'], ['invoices/new', 'receipt', 'New invoice', 'Get paid'], ['clients/new', 'user', 'New client', 'Add a customer'],
    ...(hier ? [['tasks/new', 'tasks', 'New task', 'Give someone work'], ...(TEAM.canPost() ? [['calendar/new', 'calendar', 'Add event', 'Tell the team']] : []), ...(S.role === 'owner' ? [['team/new', 'users', 'Add person', 'Invite your team']] : [])] : []),
  ];
  return `<div class="ph greet"><div><h1>${greeting()}, ${esc(firstName())}</h1><p>Here's what's happening with your business today.</p></div>
      <div class="ph-act"><span class="muted date">${esc(longDate())}</span><a class="btn primary" href="#/${hier ? 'tasks/new' : 'quotes/new'}">${icon('plus', 18)}${hier ? 'New task' : 'New quote'}</a></div></div>
    ${limitBanner}${hint}${nudge}
    <div class="grid g4">
      ${kpi({ ic: 'briefcase', label: 'Jobs this month', n: lim.unlimited ? used : `${used} / ${lim.max}`, href: '#/jobs' })}
      ${kpi({ ic: 'receipt', tone: 'green', label: 'Outstanding', n: zar(outstanding), sub: plural(unpaid.length, 'unpaid invoice'), href: '#/invoices' })}
      ${kpi({ ic: 'alert', tone: overdue.length ? 'red' : 'amber', label: 'Overdue invoices', n: overdue.length, warn: !!overdue.length, href: '#/invoices' })}
      ${kpi({ ic: 'file', tone: 'purple', label: 'Quotes awaiting reply', n: quotesOpen, href: '#/quotes' })}
    </div>
    ${hier ? TEAM.homeCards() : ''}
    <div class="two-col">${chartCard()}${activityFeed()}</div>
    <div class="two-col even">${hier ? TEAM.upcomingCard() : ''}
      ${rem('Overdue invoices', overdue.map((i) => `<div class="row" style="box-shadow:none"><div class="main"><div class="t">${esc(i.number)} · ${esc(cn(i.clientId))}</div><div class="s">${zar(i.total)} · due ${esc(L.fmtDate(i.dueAt))}</div></div>${waBtn(client(i.clientId).phone, remindText(i), 'Remind')}</div>`))}
      ${rem('Certificates due for renewal', renewals.map((c) => `<div class="row" style="box-shadow:none"><div class="main"><div class="t">${esc(c.number)} · ${esc(cn(c.clientId))}</div><div class="s">Renewal ${esc(L.fmtDate(c.renewAt))}</div></div>${waBtn(client(c.clientId).phone, renewText(c), 'Contact')}</div>`))}</div>
    <h3>Quick actions</h3><div class="quick">${quick.map(([h, ic, t, s]) => `<a href="#/${h}">${icon(ic, 22)}<div><b>${t}</b><span class="s">${s}</span></div></a>`).join('')}</div>`;
}
function dismissed(k) { try { return localStorage.getItem('tl_' + k) === '1'; } catch { return false; } }

// ---------------------------------------------------------------- profile (picture + name)
function viewProfile() {
  const me = myMem();
  const t = S.tenant;
  return `<div class="ph"><div><h1>My profile</h1><p>How you appear to your team.</p></div></div>
    <div class="card"><div class="profile-top">${avatar(me, 'xl')}<div><h2 style="margin:0">${esc(me.name || '')}</h2><div class="muted">${esc(roleLabel(me.role || S.role))} · ${esc(t.branding?.displayName || t.name)}</div>
      <div class="muted">${esc(me.email || S.user?.email || '')}</div>
      <div class="photo-actions"><label class="btn primary sm" for="photo-input" style="cursor:pointer">${icon('camera', 16)}${me.photo ? 'Change picture' : 'Add a picture'}</label>
      ${me.photo ? '<button class="btn sm danger" data-action="photo-remove">Remove</button>' : ''}</div>
      <input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      <p class="kpi-s" style="margin-top:.5rem">A square photo of your face works best. It is shrunk on your phone before it is saved.</p></div></div></div>
    <div class="card"><h3>Your name</h3><form data-profile class="inline"><input name="name" value="${esc(me.name || '')}" required minlength="2" maxlength="60" aria-label="Your name"><button class="btn primary">Save</button></form>
      <p class="muted" style="margin:0">This is the name on tasks, chat messages and documents.</p></div>
    <div class="card"><h3>Account</h3><div class="bar" style="margin:0"><button class="btn" data-action="send-reset">${icon('mail', 16)}Email me a password reset link</button><button class="btn danger" data-action="logout">${icon('logout', 16)}Sign out</button></div></div>`;
}

const ROW = {
  clients: (c) => ({ t: c.name, s: [c.phone, c.address].filter(Boolean).join(' · '), r: '', b: '' }),
  quotes: (q) => ({ t: `${q.number} · ${cn(q.clientId)}`, s: q.title || '', r: zar(q.total), b: q.status }),
  jobs: (j) => ({ t: j.title, s: [cn(j.clientId), j.date ? L.fmtDate(j.date) : ''].filter(Boolean).join(' · '), r: '', b: j.status }),
  certificates: (c) => ({ t: `${c.number} · ${cn(c.clientId)}`, s: [L.CERT_TYPES[c.type]?.label, c.address].filter(Boolean).join(' · '), r: '', b: c.status }),
  invoices: (i) => ({ t: `${i.number} · ${cn(i.clientId)}`, s: i.dueAt ? `Due ${L.fmtDate(i.dueAt)}` : '', r: zar(i.total), b: L.isOverdue(i) ? 'overdue' : i.status }),
};
const hay = (key, it) => `${Object.values(ROW[key](it)).join(' ')} ${it.notes || ''} ${it.email || ''} ${it.address || ''} ${it.title || ''}`.toLowerCase();
const rowHtml = (key, it) => {
  const r = ROW[key](it);
  return `<a class="row" href="#/${key}/${esc(it.id)}"><div class="main"><div class="t">${esc(r.t)}</div><div class="s">${esc(r.s)}</div></div>${r.r ? `<div class="r">${esc(r.r)}</div>` : ''}${badge(r.b)}</a>`;
};

function viewSearch(q) {
  const needle = q.toLowerCase();
  if (!needle) return `<div class="ph"><div><h1>Search</h1><p>Find a client, quote, job, certificate or invoice.</p></div></div>
    <form data-search class="search"><input name="q" type="search" placeholder="Search names, numbers, addresses…" aria-label="Search" required autofocus></form>`;
  const sections = KEYS.map((key) => {
    const hits = S[key].filter((it) => hay(key, it).includes(needle));
    return hits.length ? `<h3>${ENT[key].plural}</h3>${hits.map((it) => rowHtml(key, it)).join('')}` : '';
  }).join('');
  return `<div class="head"><a href="#/dashboard" class="link">← Back</a></div><h2>Results for “${esc(q)}”</h2>${sections || '<div class="empty">Nothing found.</div>'}`;
}

// ---------------------------------------------------------------- lists
function listRows(key, q) {
  const needle = (q || '').trim().toLowerCase();
  const items = S[key].filter((it) => !needle || hay(key, it).includes(needle));
  if (!items.length) return `<div class="empty">${needle ? 'No matches.' : `No ${ENT[key].plural.toLowerCase()} yet.`}</div>`;
  return items.map((it) => rowHtml(key, it)).join('');
}

function viewList(key) {
  const E = ENT[key];
  const q = S.q[key] || '';
  let extra = '';
  if (key === 'jobs') {
    const lim = L.jobsLimitState(S.tenant.entitlements.limits, jobsUsed());
    if (!lim.unlimited) extra = `<div class="banner">${jobsUsed()} of ${lim.max} jobs used this month.${lim.reached ? ' <a href="#/billing">Upgrade</a> to add more.' : ''}</div>`;
  }
  if (key === 'invoices' && has('accountingExport')) {
    extra = `<div class="bar" style="margin-top:0"><button class="btn" data-action="export-csv">Export CSV for accounting</button></div>`;
  }
  const canCreate = S.role !== 'employee' || key === 'certificates';
  const n = S[key].length;
  return `<div class="ph"><div><h1>${E.plural}</h1><p>${n ? `${n} in total` : `Nothing here yet`}</p></div><div class="ph-act">${canCreate ? `<a class="btn primary" href="#/${key}/new">${icon('plus', 18)}New ${E.singular.toLowerCase()}</a>` : ''}</div></div>${extra}
    <div class="search"><input type="search" placeholder="Search ${E.plural.toLowerCase()}" value="${esc(q)}" data-filter="${key}" aria-label="Search ${E.plural.toLowerCase()}"></div>
    <div id="rows">${listRows(key, q)}</div>`;
}

// ---------------------------------------------------------------- form building blocks
function fld(label, name, val = '', o = {}) {
  const req = o.required ? 'required' : '';
  let ctl;
  if (o.type === 'textarea') ctl = `<textarea name="${name}" rows="3" ${req}>${esc(val)}</textarea>`;
  else if (o.type === 'select') {
    ctl = `<select name="${name}" ${req}>${o.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else ctl = `<input name="${name}" type="${o.type || 'text'}" value="${esc(val)}" ${req} ${o.attrs || ''}>`;
  return `<label class="f"><span>${esc(label)}</span>${ctl}</label>`;
}
const clientField = (val) =>
  fld('Client', 'clientId', val, { type: 'select', required: true, options: [['', 'Select client…'], ...S.clients.map((c) => [c.id, c.name])] }) +
  (S.clients.length ? '' : `<p class="muted">No clients yet. <a href="#/clients/new">Add one first</a>.</p>`);

const itemRow = (i) => `<div class="item"><input data-k="desc" placeholder="Description" value="${esc(i.desc)}"><input data-k="qty" type="number" inputmode="decimal" step="any" min="0" value="${esc(i.qty)}"><input data-k="price" type="number" inputmode="decimal" step="any" min="0" value="${esc(i.price)}"><button type="button" class="x" data-action="del-item" aria-label="Remove line">×</button></div>`;
const itemsEditor = (items) => `<h3>Items</h3><div class="item-h"><span>Description</span><span>Qty</span><span>Price</span><span></span></div><div class="items" id="items">${items.map(itemRow).join('')}</div><button type="button" class="btn ghost" data-action="add-item">+ Add line</button>`;
const totalsHtml = (t) => `<div class="totals" id="totals"><div><span>Subtotal</span><span>${zar(t.sub)}</span></div><div><span>VAT (15%)</span><span>${zar(t.vat)}</span></div><div class="grand"><span>Total</span><span>${zar(t.total)}</span></div></div>`;
const vatField = (on) => `<label class="check-f"><input type="checkbox" name="vat" ${on ? 'checked' : ''}> Add 15% VAT</label>`;

function readItems(form, keepBlank = false) {
  return [...form.querySelectorAll('.item')]
    .map((r) => ({ desc: r.querySelector('[data-k=desc]').value.trim(), qty: Number(r.querySelector('[data-k=qty]').value) || 0, price: Number(r.querySelector('[data-k=price]').value) || 0 }))
    .filter((i) => keepBlank || i.desc);
}
function updateTotals() {
  const f = $('form[data-form]');
  const el = $('#totals');
  if (!f || !el || !f.elements.vat) return;
  el.outerHTML = totalsHtml(L.lineTotals(readItems(f, true), f.elements.vat.checked));
}

function formShell(key, title, inner, { id, isNew, locked = false, extra = '', canDelete = true }) {
  return `<div class="head"><a href="#/${key}" class="link">← Back</a></div><h2>${esc(title)}</h2>
    <form data-form="${key}" data-id="${esc(id)}"><fieldset ${locked ? 'disabled' : ''}>${inner}</fieldset>
    <div class="bar">${locked ? '' : `<button class="btn primary" name="intent" value="save">Save</button>`}${extra}${!isNew && canDelete && !locked ? `<button type="button" class="btn danger" data-action="delete" data-key="${key}" data-id="${esc(id)}">Delete</button>` : ''}</div></form>`;
}

// ---- signature pad
let SIG = null;
function makePad(c) {
  const ctx = c.getContext('2d');
  let drawing = false, drawn = false;
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
  const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', (e) => { drawing = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  c.addEventListener('pointermove', (e) => { if (!drawing) return; ctx.lineTo(...pos(e)); ctx.stroke(); drawn = true; });
  const end = () => { drawing = false; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  return { isEmpty: () => !drawn, clear() { ctx.clearRect(0, 0, c.width, c.height); drawn = false; }, data: () => c.toDataURL('image/png') };
}
const sigData = () => (SIG && !SIG.isEmpty() ? SIG.data() : null);
const sigBlock = (btnLabel, intent) => `<canvas id="sig" width="600" height="200" aria-label="Signature"></canvas>
  <div class="bar"><button type="button" class="btn ghost" data-action="sig-clear">Clear</button>${btnLabel ? `<button class="btn primary" name="intent" value="${intent}">${btnLabel}</button>` : ''}</div>`;

function afterRender() {
  const c = $('#sig');
  SIG = c ? makePad(c) : null;
  // Employees can look at clients and move a job along (status and notes); nothing else.
  if (S.role === 'employee') {
    const cf = $('form[data-form=clients]');
    if (cf) cf.querySelectorAll('input,textarea,select,button').forEach((e) => { e.disabled = true; });
    const jf = $('form[data-form=jobs]');
    if (jf) {
      jf.querySelectorAll('input,textarea,select,button').forEach((e) => { if (!['status', 'notes'].includes(e.name) && e.name !== 'intent') e.disabled = true; });
      jf.querySelectorAll('[data-action=delete],[data-action=job-to-cert],[data-action=job-to-invoice]').forEach((e) => e.remove());
    }
  }
  const el = document.getElementById('elapsed');
  if (el) { const ms = Date.now() - Number(el.dataset.since); el.textContent = `${Math.floor(ms / 36e5)}h ${String(Math.floor((ms % 36e5) / 6e4)).padStart(2, '0')}m`; }
}

// ---------------------------------------------------------------- forms
function viewForm(key, id) {
  const isNew = id === 'new';
  const it = isNew ? (S.draftKey === key && S.draft ? S.draft : {}) : S[key].find((x) => x.id === id);
  if (!it) return `<p class="muted">Loading… or this record doesn't exist. <a href="#/${key}">Back</a></p>`;
  return FORMS[key](it, isNew, id) + (key === 'jobs' && !isNew ? TEAM.jobExtras(it) : '');
}

const FORMS = {
  clients(c, isNew, id) {
    return formShell('clients', isNew ? 'New client' : c.name,
      fld('Name', 'name', c.name, { required: true }) + fld('Phone (WhatsApp)', 'phone', c.phone, { type: 'tel', attrs: 'inputmode="tel"' }) +
      fld('Email', 'email', c.email, { type: 'email' }) + fld('Address', 'address', c.address) + fld('Notes', 'notes', c.notes, { type: 'textarea' }),
      { id, isNew });
  },

  quotes(q, isNew, id) {
    const d = isNew ? { items: [{ desc: '', qty: 1, price: 0 }], vat: true, status: 'draft', ...q } : q;
    const sigImg = L.safeImg(d.signature);
    const approvedBlock = d.status === 'approved' && sigImg
      ? `<h3>Client approval</h3><img class="sig-img" src="${sigImg}" alt="Client signature"><p class="muted">Approved${d.signedBy ? ' by ' + esc(d.signedBy) : ''} on ${esc(L.fmtDate(d.approvedAt))}</p>`
      : !isNew ? `<h3>Client approval</h3>${fld('Approved by (name)', 'signedBy', d.signedBy || '')}<p class="muted">Client signs below with their finger.</p>${sigBlock('Approve with signature', 'approve')}` : '';
    const extra = isNew ? '' : `<a class="btn" href="#/print/quotes/${esc(id)}">Print / PDF</a>${waBtn(client(d.clientId).phone, shareText('quotes', d), 'WhatsApp')}<button type="button" class="btn" data-action="quote-to-job" data-id="${esc(id)}">Convert to job</button>`;
    return formShell('quotes', isNew ? 'New quote' : d.number,
      clientField(d.clientId) + fld('Title', 'title', d.title, { attrs: 'placeholder="e.g. DB board upgrade"' }) +
      itemsEditor(d.items) + vatField(d.vat) + totalsHtml(L.lineTotals(d.items, d.vat)) +
      fld('Status', 'status', d.status, { type: 'select', options: [['draft', 'Draft'], ['sent', 'Sent'], ['approved', 'Approved'], ['declined', 'Declined']] }) +
      fld('Notes', 'notes', d.notes, { type: 'textarea' }) + approvedBlock,
      { id, isNew, extra });
  },

  jobs(j, isNew, id) {
    const d = isNew ? { status: 'scheduled', ...j } : j;
    const extra = isNew ? '' : `<button type="button" class="btn" data-action="job-to-cert" data-id="${esc(id)}">Create certificate</button><button type="button" class="btn" data-action="job-to-invoice" data-id="${esc(id)}">Create invoice</button>`;
    return formShell('jobs', isNew ? 'New job' : d.title,
      fld('Job title', 'title', d.title, { required: true }) + clientField(d.clientId) + fld('Site address', 'address', d.address) +
      fld('Date', 'date', L.toDateInput(d.date), { type: 'date' }) +
      fld('Status', 'status', d.status, { type: 'select', options: [['scheduled', 'Scheduled'], ['in_progress', 'In progress'], ['done', 'Done']] }) +
      fld('Notes', 'notes', d.notes, { type: 'textarea' }) +
      (d.quoteId ? `<p class="muted">From quote <a href="#/quotes/${esc(d.quoteId)}">${esc(S.quotes.find((x) => x.id === d.quoteId)?.number || 'quote')}</a></p>` : ''),
      { id, isNew, extra });
  },

  certificates(c, isNew, id) {
    const locked = c.status === 'issued';
    const type = c.type || 'electrical';
    const d = isNew
      ? { type, installer: S.profile.defaultInstaller || '', regNo: S.profile.regNo || '', testedOn: Date.now(), checks: defaultChecks(type), status: 'draft', ...c }
      : c;
    const sigImg = L.safeImg(d.signature);
    const sig = locked
      ? `<h3>Installer signature</h3>${sigImg ? `<img class="sig-img" src="${sigImg}" alt="Installer signature">` : ''}<p class="muted">Issued ${esc(L.fmtDate(d.issuedAt))}. This certificate is locked.</p>`
      : `<h3>Installer signature</h3><p class="muted">Sign with your finger. Needed to issue.</p>${sigBlock('', '')}`;
    const extra = locked
      ? `<a class="btn primary" href="#/print/certificates/${esc(id)}">Print / PDF</a>${waBtn(client(d.clientId).phone, shareText('certificates', d), 'WhatsApp')}`
      : isNew ? `<button class="btn" name="intent" value="issue">Save &amp; issue</button>` : `<button class="btn" name="intent" value="issue">Issue certificate</button><a class="btn" href="#/print/certificates/${esc(id)}">Preview</a>`;
    return formShell('certificates', isNew ? 'New certificate' : d.number,
      fld('Type', 'type', d.type, { type: 'select', options: Object.entries(L.CERT_TYPES).map(([k, v]) => [k, v.label]) }) +
      clientField(d.clientId) +
      fld('Linked job (optional)', 'jobId', d.jobId || '', { type: 'select', options: [['', 'No linked job'], ...S.jobs.map((j) => [j.id, j.title])] }) +
      fld('Installation address', 'address', d.address, { required: true }) + fld('Date tested', 'testedOn', L.toDateInput(d.testedOn), { type: 'date', required: true }) +
      `<h3>Tests and checks</h3><div id="checks">${checksHtml(d.checks)}</div>` +
      fld('Installer name', 'installer', d.installer, { required: true }) + fld('Registration number', 'regNo', d.regNo, { required: true }) +
      fld('Renewal reminder date (optional)', 'renewAt', L.toDateInput(d.renewAt), { type: 'date' }) + fld('Notes', 'notes', d.notes, { type: 'textarea' }) + sig,
      { id, isNew, locked, extra, canDelete: false });
  },

  invoices(i, isNew, id) {
    const d = isNew ? { items: [{ desc: '', qty: 1, price: 0 }], vat: true, status: 'draft', dueAt: Date.now() + 14 * 864e5, ...i } : i;
    const extra = isNew ? '' : `${d.status !== 'paid' ? `<button class="btn" name="intent" value="paid">Mark paid</button>` : ''}<a class="btn" href="#/print/invoices/${esc(id)}">Print / PDF</a>${waBtn(client(d.clientId).phone, shareText('invoices', d), 'WhatsApp')}`;
    return formShell('invoices', isNew ? 'New invoice' : d.number,
      clientField(d.clientId) +
      fld('Linked job (optional)', 'jobId', d.jobId || '', { type: 'select', options: [['', 'No linked job'], ...S.jobs.map((j) => [j.id, j.title])] }) +
      itemsEditor(d.items) + vatField(d.vat) + totalsHtml(L.lineTotals(d.items, d.vat)) +
      fld('Due date', 'dueAt', L.toDateInput(d.dueAt), { type: 'date' }) +
      fld('Status', 'status', d.status, { type: 'select', options: [['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid']] }) +
      fld('Notes', 'notes', d.notes, { type: 'textarea' }) +
      (d.status === 'paid' && d.paidAt ? `<p class="muted">Paid on ${esc(L.fmtDate(d.paidAt))}</p>` : ''),
      { id, isNew, extra, canDelete: d.status === 'draft' });
  },
};

const defaultChecks = (type) => (L.CERT_TYPES[type] || L.CERT_TYPES.other).checks.map((label) => ({ label, result: '', note: '' }));
const checksHtml = (checks = []) => checks.map((c) => `<div class="check" data-label="${esc(c.label)}"><div class="lbl">${esc(c.label)}</div>
  <select>${[['', '—'], ['pass', 'Pass'], ['fail', 'Fail'], ['na', 'N/A']].map(([v, l]) => `<option value="${v}" ${c.result === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <input placeholder="Reading / note" value="${esc(c.note || '')}"></div>`).join('');

// ---------------------------------------------------------------- saving
async function assertJobAllowed() {
  const lim = L.jobsLimitState(S.tenant.entitlements.limits, jobsUsed());
  if (lim.reached) throw new Error(`You've used all ${lim.max} jobs this month on the ${planLabel(S.tenant.tier)} plan. Upgrade to add more.`);
}
async function createJob(data) {
  await assertJobAllowed();
  return D.create(S.tid, 'jobs', data);
}

function docBase(f) {
  const items = readItems(f);
  if (!items.length) throw new Error('Add at least one item.');
  const vat = f.elements.vat.checked;
  const t = L.lineTotals(items, vat);
  const clientId = f.elements.clientId.value;
  if (!clientId) throw new Error('Choose a client.');
  return { clientId, items, vat, sub: t.sub, vatAmount: t.vat, total: t.total };
}
const val = (f, n) => (f.elements[n]?.value ?? '').trim();

const SAVE = {
  async clients(f) {
    if (!val(f, 'name')) throw new Error('Name is required.');
    return { name: val(f, 'name'), phone: val(f, 'phone'), email: val(f, 'email'), address: val(f, 'address'), notes: val(f, 'notes') };
  },

  async quotes(f, intent, ex) {
    const d = { ...docBase(f), title: val(f, 'title'), notes: val(f, 'notes'), status: val(f, 'status'), number: ex.number || L.docNumber('QUO') };
    if (intent === 'approve') {
      const sig = sigData();
      if (!sig) throw new Error('Ask the client to sign first.');
      Object.assign(d, { status: 'approved', approvedAt: Date.now(), signature: sig, signedBy: val(f, 'signedBy') });
    }
    return d;
  },

  async jobs(f, intent, ex, isNew) {
    if (!val(f, 'title')) throw new Error('Job title is required.');
    if (!f.elements.clientId.value) throw new Error('Choose a client.');
    if (isNew) await assertJobAllowed();
    return {
      title: val(f, 'title'), clientId: f.elements.clientId.value, address: val(f, 'address'),
      date: L.fromDateInput(val(f, 'date')), status: val(f, 'status'), notes: val(f, 'notes'), quoteId: ex.quoteId || null,
    };
  },

  async certificates(f, intent, ex) {
    const checks = [...f.querySelectorAll('.check')].map((r) => ({ label: r.dataset.label, result: r.querySelector('select').value, note: r.querySelector('input').value.trim() }));
    const d = {
      type: val(f, 'type'), clientId: f.elements.clientId.value, jobId: val(f, 'jobId') || null, address: val(f, 'address'),
      testedOn: L.fromDateInput(val(f, 'testedOn')), installer: val(f, 'installer'), regNo: val(f, 'regNo'),
      renewAt: L.fromDateInput(val(f, 'renewAt')), notes: val(f, 'notes'), checks, status: 'draft',
      number: ex.number || L.docNumber('COC'),
    };
    const sig = sigData();
    if (sig) d.signature = sig;
    if (intent === 'issue') {
      if (!d.clientId) throw new Error('Choose a client.');
      if (!d.address || !d.installer || !d.regNo || !d.testedOn) throw new Error('Fill in the address, date, installer name and registration number.');
      if (checks.some((c) => !c.result)) throw new Error('Mark every test as Pass, Fail or N/A before issuing.');
      if (checks.some((c) => c.result === 'fail')) throw new Error("A failed test means this can't be certified as compliant. Fix the issue and retest first.");
      if (!sig && !ex.signature) throw new Error('Sign the certificate before issuing.');
      d.status = 'issued';
      d.issuedAt = Date.now();
    }
    return d;
  },

  async invoices(f, intent, ex) {
    const d = {
      ...docBase(f), jobId: val(f, 'jobId') || null, dueAt: L.fromDateInput(val(f, 'dueAt')),
      notes: val(f, 'notes'), status: val(f, 'status'), number: ex.number || L.docNumber('INV'),
    };
    if (intent === 'paid' || d.status === 'paid') { d.status = 'paid'; d.paidAt = ex.paidAt || Date.now(); }
    return d;
  },
};

async function submitForm(f, intent) {
  if (f.dataset.form === 'settings') {
    const fields = ['businessName', 'phone', 'email', 'address', 'vatNo', 'regNo', 'defaultInstaller', 'bank'];
    await D.saveProfile(S.tid, Object.fromEntries(fields.map((n) => [n, val(f, n)])));
    toast('Settings saved');
    return nav('#/dashboard');
  }
  const key = f.dataset.form;
  const id = f.dataset.id;
  const isNew = id === 'new';
  const ex = isNew ? {} : (S[key].find((x) => x.id === id) || {});
  const data = JSON.parse(JSON.stringify(await SAVE[key](f, intent, ex, isNew))); // drops undefined

  const btns = [...f.querySelectorAll('button')];
  btns.forEach((b) => (b.disabled = true));
  try {
    if (isNew) await D.create(S.tid, key, data);
    else await D.save(S.tid, key, id, data);
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
  S.draft = null;
  toast(intent === 'issue' ? 'Certificate issued' : intent === 'approve' ? 'Quote approved' : intent === 'paid' ? 'Marked as paid' : 'Saved');
  nav('#/' + key);
}

// ---------------------------------------------------------------- billing + settings
function viewBilling() {
  const t = S.tenant;
  const b = t.billing || {};
  const cur = t.tier;
  const used = jobsUsed();
  const lim = L.jobsLimitState(t.entitlements.limits, used);
  const managed = !!t.overrides?.contractManaged;
  const hasSub = !!b.paystackSubscriptionCode;
  const tr = trialState(t);

  const planCard = (tier, title, price, bullets) => {
    const isCurrent = cur === tier && !tr.active;
    const keeping = tr.active && tr.tier === tier;
    const label = tier === 'standard'
      ? (keeping ? 'Subscribe to keep Standard' : cur === 'business' ? 'Switch to Standard' : 'Upgrade to Standard')
      : (keeping ? 'Subscribe to keep Business' : cur === 'standard' && !tr.active ? 'Switch to Business' : 'Upgrade to Business');
    const canTrial = tier === 'business' && !managed && !hasSub && !t.trialsUsed?.business && cur !== 'business';
    return `<div class="plan"><h3>${title} <span class="muted">${esc(formatPrice(price))}/month</span></h3><ul>${bullets.map((x) => `<li>${x}</li>`).join('')}</ul>
      ${isCurrent ? '<span class="pill">Current plan</span>' : `${canTrial ? '<button class="btn" data-action="start-trial">Try Business free for 30 days (no card)</button> ' : ''}<button class="btn primary" data-action="checkout" data-tier="${tier}">${label}</button>`}</div>`;
  };
  let action;
  if (managed) action = `<p class="muted">Your plan is set by agreement with us. Contact us to change it.</p>`;
  else {
    action = planCard('standard', 'Standard', PRICING.standard, [
      'Unlimited jobs', `Up to ${PLANS.standard.limits.seats} people`, `${PLANS.standard.limits.storageMb / 1000} GB storage`, 'Accounting export (CSV)',
    ]) + planCard('business', 'Business', PRICING.business, [
      'Everything in Standard', `Up to ${PRICING.business.includedSeats} people (more by arrangement)`,
      'Team hierarchy: owner, department heads, managers, employees', 'Tasks and work documents with read confirmation',
      'Time tracking and leave with approvals', 'Team chat and groups', 'Shared team calendar (owner picks who adds events)', 'Profile pictures for everyone', 'Payslip records', 'Job costing and team reports',
      'Business document library with permissions and expiry alerts', 'Customer support inbox with a public contact page',
    ]);
    if (hasSub) {
      action += `<p class="muted">${b.cancelAtPeriodEnd ? 'Your subscription will not renew.' : b.nextPaymentDate ? `Next payment: ${esc(L.fmtDate(Date.parse(b.nextPaymentDate)))}.` : ''}</p>
        ${b.cancelAtPeriodEnd ? '' : `<button class="btn danger" data-action="cancel-sub">Cancel subscription</button>`}
        <p class="muted" style="font-size:.85rem">Switching plan starts the new plan straight away and cancels the old one for you.</p>`;
    }
  }
  const trialNote = tr.active ? `<p class="muted">Your free trial of ${tr.tier === 'business' ? 'Business' : 'Standard'} ends on ${esc(L.fmtDate(tr.endsAt))} (${tr.daysLeft} day${tr.daysLeft === 1 ? '' : 's'} left). After that you move to the Free plan unless you subscribe.${tr.tier === 'business' ? ' Your team, tasks, documents and records are kept; your team simply cannot sign in until you subscribe.' : ''} Subscribing starts your paid month right away.</p>` : '';
  return `<h2>Your plan</h2>${trialNote}
    <div class="plan cur"><h3>${esc(planLabel(cur))}${tr.active ? ' <span class="muted">(trial)</span>' : ''}</h3>
    <ul><li>Jobs this month: ${lim.unlimited ? `${used} (unlimited)` : `${used} of ${lim.max}`}</li><li>People: up to ${t.entitlements.limits.seats}</li><li>Storage: ${t.entitlements.limits.storageMb} MB</li></ul></div>${action}`;
}

function viewSettings() {
  const p = S.profile || {};
  return formShell('settings', 'Business details',
    `<p class="muted">These appear on your quotes, invoices and certificates.</p>` +
    fld('Business name', 'businessName', p.businessName || S.tenant.name) + fld('Phone', 'phone', p.phone, { type: 'tel' }) + fld('Email', 'email', p.email, { type: 'email' }) +
    fld('Address', 'address', p.address, { type: 'textarea' }) + fld('VAT number (if registered)', 'vatNo', p.vatNo) +
    fld('Default installer name', 'defaultInstaller', p.defaultInstaller) + fld('Installer registration number', 'regNo', p.regNo) +
    fld('Banking details (shown on invoices)', 'bank', p.bank, { type: 'textarea' }),
    { id: 'profile', isNew: false, canDelete: false });
}

// ---------------------------------------------------------------- print / share
function shareText(type, it) {
  const biz = S.profile.businessName || S.tenant.branding?.displayName || S.tenant.name;
  const name = cn(it.clientId);
  if (type === 'invoices') return `Hi ${name}, invoice ${it.number} from ${biz} for ${zar(it.total)}${it.dueAt ? `, due ${L.fmtDate(it.dueAt)}` : ''}. Thank you!`;
  if (type === 'quotes') return `Hi ${name}, here is quote ${it.number} from ${biz} for ${zar(it.total)}. Let me know if you'd like to go ahead.`;
  return `Hi ${name}, your ${L.CERT_TYPES[it.type]?.label || 'certificate'} (${it.number}) from ${biz} is ready.`;
}

function docHtml(type, it) {
  if (type === 'payslips') return TEAM.payslipDoc(it);
  const p = S.profile || {};
  const t = S.tenant;
  const c = client(it.clientId);
  const biz = p.businessName || t.branding?.displayName || t.name;
  const logo = L.safeUrl(t.branding?.logoUrl);
  const isCert = type === 'certificates';
  const title = isCert ? (L.CERT_TYPES[it.type]?.label || 'Certificate of Compliance') : type === 'quotes' ? 'QUOTE' : (it.vat && p.vatNo ? 'TAX INVOICE' : 'INVOICE');
  const br = (s) => esc(s || '').replace(/\n/g, '<br>');

  const head = `<header><div>${logo ? `<img src="${esc(logo)}" alt="" style="max-height:56px"><br>` : ''}<strong>${esc(biz)}</strong><br>${br(p.address)}${p.phone ? `<br>${esc(p.phone)}` : ''}${p.email ? `<br>${esc(p.email)}` : ''}${p.vatNo ? `<br>VAT No: ${esc(p.vatNo)}` : ''}</div>
    <div style="text-align:right"><h1>${esc(title)}</h1>${esc(it.number)}<br>${esc(L.fmtDate(it.issuedAt || it.createdAt))}</div></header>`;

  const billTo = `<div class="two"><div><strong>${isCert ? 'Client' : 'Bill to'}</strong><br>${esc(c.name || '')}<br>${br(c.address)}${c.phone ? `<br>${esc(c.phone)}` : ''}</div>${isCert ? `<div><strong>Installation address</strong><br>${br(it.address)}<br>Tested on ${esc(L.fmtDate(it.testedOn))}</div>` : ''}</div>`;

  let body;
  if (isCert) {
    const res = { pass: 'Pass', fail: 'Fail', na: 'N/A' };
    body = `<table><thead><tr><th>Test / check</th><th>Result</th><th>Reading / note</th></tr></thead><tbody>${(it.checks || []).map((k) => `<tr><td>${esc(k.label)}</td><td>${esc(res[k.result] || '')}</td><td>${esc(k.note)}</td></tr>`).join('')}</tbody></table>
      <p><strong>Installer:</strong> ${esc(it.installer)} &nbsp; <strong>Registration no:</strong> ${esc(it.regNo)}</p>
      ${it.notes ? `<p>${br(it.notes)}</p>` : ''}
      ${L.safeImg(it.signature) ? `<img class="sig-img" src="${L.safeImg(it.signature)}" alt="Signature"><small>Signature${it.issuedAt ? ` · ${esc(L.fmtDate(it.issuedAt))}` : ''}</small>` : ''}
      ${it.status !== 'issued' ? `<p><span class="draft">DRAFT: NOT ISSUED</span></p>` : ''}`;
  } else {
    body = `<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>${(it.items || []).map((i) => `<tr><td>${esc(i.desc)}</td><td class="n">${esc(i.qty)}</td><td class="n">${zar(i.price)}</td><td class="n">${zar(i.qty * i.price)}</td></tr>`).join('')}</tbody></table>
      <div class="totals"><div><span>Subtotal</span><span>${zar(it.sub)}</span></div>${it.vat ? `<div><span>VAT (15%)</span><span>${zar(it.vatAmount)}</span></div>` : ''}<div class="grand"><span>Total</span><span>${zar(it.total)}</span></div></div>
      ${type === 'invoices' ? `<p>${it.dueAt ? `<strong>Due:</strong> ${esc(L.fmtDate(it.dueAt))}` : ''} ${it.status === 'paid' ? `&nbsp; <span class="badge b-paid">PAID ${esc(L.fmtDate(it.paidAt))}</span>` : ''}</p>${p.bank ? `<p><strong>Banking details</strong><br>${br(p.bank)}<br>Reference: ${esc(it.number)}</p>` : ''}` : ''}
      ${it.notes ? `<p>${br(it.notes)}</p>` : ''}
      ${type === 'quotes' && it.status === 'approved' && L.safeImg(it.signature) ? `<p><strong>Approved${it.signedBy ? ' by ' + esc(it.signedBy) : ''}</strong> on ${esc(L.fmtDate(it.approvedAt))}</p><img class="sig-img" src="${L.safeImg(it.signature)}" alt="Client signature">` : ''}`;
  }
  const foot = has('whiteLabel') ? '' : `<p class="foot">Sent with ${esc(PLATFORM_NAME)}</p>`;
  return `<div class="doc">${head}${billTo}${body}${foot}</div>`;
}

function renderPrint(type, id) {
  if (!['quotes', 'invoices', 'certificates', 'payslips'].includes(type)) return nav('#/dashboard');
  const it = S[type].find((x) => x.id === id);
  if (!it) { $app.innerHTML = '<div class="center muted pad">Loading… <a href="#/dashboard">Home</a></div>'; return; }
  const backHref = type === 'payslips' ? `#/payroll/${esc(id)}` : `#/${type}/${esc(id)}`;
  $app.innerHTML = `<div class="toolbar"><a class="btn" href="${backHref}">← Back</a><button class="btn primary" data-action="print">Print / Save as PDF</button>${type === 'payslips' ? '' : waBtn(client(it.clientId).phone, shareText(type, it), 'Share on WhatsApp')}</div>
    <p class="muted center toolbar" style="font-size:.85rem">Choose “Save as PDF” in the print dialog, then attach the PDF in WhatsApp or email.</p>${docHtml(type, it)}`;
}

// ---------------------------------------------------------------- actions + events
const ACTIONS = {
  ...TEAM.actions,
  logout: () => D.logOut(),
  more() { S.moreOpen = !S.moreOpen; S.bellOpen = false; render(); },
  'more-close'() { S.moreOpen = false; render(); },
  bell() { S.bellOpen = !S.bellOpen; S.moreOpen = false; render(); },
  'chart-kind'(el) { S.q.chart = el.dataset.kind; render(); },
  'dismiss-nudge'() { try { localStorage.setItem('tl_nudge', '1'); } catch { /* private mode: it just shows again */ } render(); },
  async 'photo-remove'() {
    if (!confirm('Remove your picture?')) return;
    await D.api('/api/tenant', { action: 'setProfile', photo: null });
    toast('Picture removed');
  },
  async 'send-reset'() { await D.resetPassword(S.user.email); toast(`Reset link sent to ${S.user.email}`); },
  'auth-mode': (el) => renderAuth(el.dataset.mode),
  async reset() {
    const email = prompt('Enter your email and we will send a reset link');
    if (!email) return;
    await D.resetPassword(email.trim());
    toast('Password reset email sent');
  },
  'add-item': () => $('#items').insertAdjacentHTML('beforeend', itemRow({ desc: '', qty: 1, price: 0 })),
  'del-item'(el) { el.closest('.item').remove(); updateTotals(); },
  'sig-clear': () => SIG?.clear(),
  print: () => window.print(),

  async delete(el) {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    await D.remove(S.tid, el.dataset.key, el.dataset.id);
    toast('Deleted');
    nav('#/' + el.dataset.key);
  },

  async 'quote-to-job'(el) {
    const q = S.quotes.find((x) => x.id === el.dataset.id);
    const id = await createJob({ title: q.title || `Job for ${cn(q.clientId)}`, clientId: q.clientId, quoteId: q.id, status: 'scheduled', address: client(q.clientId).address || '', date: null, notes: '' });
    toast('Job created');
    nav('#/jobs/' + id);
  },
  'job-to-invoice'(el) {
    const j = S.jobs.find((x) => x.id === el.dataset.id);
    const q = S.quotes.find((x) => x.id === j.quoteId);
    S.draftKey = 'invoices';
    S.draft = { clientId: j.clientId, jobId: j.id, items: q?.items?.map((i) => ({ ...i })) || [{ desc: j.title, qty: 1, price: 0 }], vat: q?.vat ?? true };
    nav('#/invoices/new');
  },
  'job-to-cert'(el) {
    const j = S.jobs.find((x) => x.id === el.dataset.id);
    S.draftKey = 'certificates';
    S.draft = { clientId: j.clientId, jobId: j.id, address: j.address || client(j.clientId).address || '' };
    nav('#/certificates/new');
  },

  async checkout(el) {
    el.disabled = true;
    try {
      const { url } = await D.api('/api/billing', { action: 'checkout', tier: el.dataset.tier });
      location.href = url;
    } finally { el.disabled = false; }
  },
  async 'start-trial'() {
    if (!confirm('Start your free 30-day Business trial? No card needed. After 30 days you move to the Free plan unless you subscribe.')) return;
    await D.api('/api/tenant', { action: 'startTrial', tier: 'business' });
    toast('Business trial started. Open Team to add your people.');
  },
  async 'cancel-sub'() {
    if (!confirm('Cancel your subscription? You keep your plan until the end of the period it has paid for.')) return;
    await D.api('/api/billing', { action: 'cancel' });
    toast('Subscription cancelled');
  },

  'export-csv'() {
    if (!has('accountingExport')) return toast('Upgrade to export for accounting', true);
    const cols = [
      { label: 'Invoice no', get: (i) => i.number }, { label: 'Client', get: (i) => cn(i.clientId) },
      { label: 'Issued', get: (i) => L.toDateInput(i.createdAt) }, { label: 'Due', get: (i) => L.toDateInput(i.dueAt) },
      { label: 'Status', get: (i) => (L.isOverdue(i) ? 'overdue' : i.status) }, { label: 'Subtotal', get: (i) => i.sub },
      { label: 'VAT', get: (i) => i.vatAmount }, { label: 'Total', get: (i) => i.total }, { label: 'Paid on', get: (i) => L.toDateInput(i.paidAt) },
    ];
    const blob = new Blob(['﻿' + L.toCsv(S.invoices, cols)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `invoices-${L.toDateInput(Date.now())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a, button, input, select, label')) location.hash = go.dataset.go;
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-action]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('click', async (e) => {
  if (S.bellOpen && !e.target.closest('.bell-panel, [data-action=bell]')) { S.bellOpen = false; document.querySelector('.bell-panel')?.remove(); }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'more-close' && e.target !== el) return; // only the dark backdrop closes the sheet; links inside it just work
  e.preventDefault();
  try { await ACTIONS[el.dataset.action]?.(el); } catch (err) { toast(err.message || String(err), true); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  try {
    if (f.dataset.auth) {
      e.preventDefault();
      const btn = f.querySelector('button');
      btn.disabled = true;
      try {
        const fd = new FormData(f);
        const email = String(fd.get('email')).trim();
        const pw = String(fd.get('password'));
        if (f.dataset.auth === 'up') await D.signUp(email, pw); else await D.signIn(email, pw);
      } catch (err) { toast(authMsg(err), true); } finally { btn.disabled = false; }
    } else if (f.dataset.onboard !== undefined) {
      e.preventDefault();
      const btn = f.querySelector('button');
      btn.disabled = true;
      try {
        await D.api('/api/tenant', { action: 'create', name: f.elements.name.value, ownerName: f.elements.ownerName.value });
        await boot(D.auth.currentUser);
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    } else if (f.dataset.profile !== undefined) {
      e.preventDefault();
      await D.api('/api/tenant', { action: 'setProfile', name: f.elements.name.value });
      toast('Saved');
    } else if (f.dataset.search !== undefined) {
      e.preventDefault();
      const q = f.elements.q.value.trim();
      if (q) nav('#/search/' + encodeURIComponent(q));
    } else if (f.dataset.team) {
      e.preventDefault();
      await TEAM.submit(f, f.dataset.team, e.submitter?.value || 'save');
    } else if (f.dataset.form) {
      e.preventDefault();
      await submitForm(f, e.submitter?.value || 'save');
    }
  } catch (err) { toast(err.message || String(err), true); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset?.filter) {
    S.q[t.dataset.filter] = t.value;
    $('#rows').innerHTML = listRows(t.dataset.filter, t.value);
  } else if (t.closest?.('.items')) updateTotals();
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'photo-input') {
    const file = t.files[0];
    t.value = '';
    if (!file) return;
    try {
      toast('Saving your picture…');
      const photo = await shrinkImage(file);
      await D.api('/api/tenant', { action: 'setProfile', photo });
      toast('Picture saved');
    } catch (err) { toast(err.message || String(err), true); }
    return;
  }
  if (t.name === 'vat') updateTotals();
  if (t.name === 'type' && t.form?.dataset.form === 'certificates' && t.form.dataset.id === 'new') {
    $('#checks').innerHTML = checksHtml(defaultChecks(t.value));
  }
});

window.addEventListener('hashchange', () => { if (S.tid) { S.moreOpen = false; S.bellOpen = false; render(); window.scrollTo(0, 0); } });
D.onAuth((user) => boot(user).catch((err) => { console.error(err); toast(err.message || 'Could not start', true); }));
