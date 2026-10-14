import { firebaseConfig } from './firebase-config.js';
import { PLATFORM_NAME, logoSvg, applyBrand } from './brand.js';
applyBrand(`${PLATFORM_NAME} admin`);
import { esc, zar } from './lib.js';
import { PLANS, FEATURES, LIMIT_KEYS, TIERS, resolveEntitlements, trialState } from './shared/plans.js';

const root = document.getElementById('app');
const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => !firebaseConfig[k] || /REPLACE/i.test(String(firebaseConfig[k])));
if (missing.length) {
  root.innerHTML = `<div class="auth"><h1>Setup needed</h1><p class="muted">Fill in <code>public/firebase-config.js</code> (${esc(missing.join(', '))}).</p></div>`;
} else {
  start().catch((e) => { root.innerHTML = `<div class="auth"><h1>Admin could not start</h1><p class="err">${esc(e.message)}</p></div>`; });
}

const PERMS = {
  super_admin: { write: true, status: true, audit: true },
  support: { write: false, status: true, audit: false },
  billing: { write: false, status: false, audit: false },
  read_only: { write: false, status: false, audit: false },
};
const FEATURE_LABELS = {
  quotes: 'Quotes', jobs: 'Jobs', certificates: 'Certificates', invoices: 'Invoices', esign: 'E-signature',
  clientChat: 'Client chat', accountingExport: 'CSV export', hierarchy: 'Team hierarchy', tasks: 'Tasks',
  workDocs: 'Work documents', timeLeave: 'Time & leave', teamChat: 'Team chat', jobCosting: 'Job costing',
  teamReports: 'Team reports', whiteLabel: 'White label', customDomain: 'Custom domain',
};
const LIMIT_LABELS = { jobsPerMonth: 'Jobs per month', seats: 'Seats', storageMb: 'Storage (MB)', smsCredits: 'SMS credits' };
const fmt = (ms) => (ms ? new Date(ms).toLocaleString('en-ZA') : '—');
const tag = (text, kind = '') => `<span class="tag ${kind}">${esc(text)}</span>`;
const statusTag = (s) => tag(s, s === 'active' ? 'ok' : s === 'past_due' ? 'warn' : 'bad');

async function start() {
  const D = await import('./data.js');
  let role = null;
  let state = { view: 'list', tenants: [], search: '', detail: null, audit: [] };

  const toast = (msg, bad) => {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  };
  const call = (body) => D.api('/api/admin', body);
  const can = (k) => !!PERMS[role]?.[k];
  const busy = async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); return null; }
  };

  // ---------- views ----------
  const shell = (inner) => `
    <div class="top">${logoSvg(26)}<div class="brand">${esc(PLATFORM_NAME)} · Platform admin</div>
      ${tag(role.replace('_', ' '))}<a class="link" href="/">Open app</a><button class="link" data-a="out">Sign out</button></div>
    <div class="tabs"><a href="#" data-a="goto-list" class="${state.view !== 'audit' ? 'on' : ''}">Businesses</a>
      ${can('audit') ? `<a href="#" data-a="goto-audit" class="${state.view === 'audit' ? 'on' : ''}">Audit log</a>` : ''}</div>
    <main class="wide adm">${inner}</main>`;

  const loginView = (err = '') => `
    <div class="auth"><h1>Platform admin</h1><p class="muted">Staff sign-in. Ordinary customer accounts have no access here.</p>
      <form data-form="login"><label>Email<input name="email" type="email" required autocomplete="username"></label>
      <label>Password<input name="pw" type="password" required autocomplete="current-password"></label>
      <p class="err">${esc(err)}</p><button class="btn primary wide">Sign in</button></form>
      <p class="muted">No account yet? Create one on the <a href="/">main sign-in page</a> first, then come back.</p></div>`;

  const noAccess = (user) => `<div class="auth"><h1>Not an admin yet</h1>
    <p class="muted">${esc(user.email)} is signed in but is not a platform admin.</p>
    <p class="muted"><b>If this is you (the owner):</b></p>
    <ol class="muted"><li>Make sure your email is in the <code>PLATFORM_ADMIN_EMAILS</code> setting in Vercel.</li>
    <li>${user.emailVerified ? 'Your email is verified.' : 'Press <b>Send verification email</b>, open the email and click its link.'}</li>
    <li>Press <b>Make me admin</b>.</li></ol>
    <div class="btns">${user.emailVerified ? '' : '<button class="btn" data-a="verify">Send verification email</button>'}
    <button class="btn primary" data-a="claim">Make me admin</button><button class="btn" data-a="out">Sign out</button></div></div>`;

  const listView = () => `
    <h2>Businesses</h2>
    <form data-form="search" class="two" style="grid-template-columns:1fr auto"><input name="q" placeholder="Search by name (starts with)" value="${esc(state.search)}"><button class="btn">Search</button></form>
    <div class="card scroll" style="margin-top:.8rem"><table class="t"><thead><tr><th>Name</th><th>Plan</th><th>Status</th><th>Contract</th><th>Created</th></tr></thead><tbody>
    ${state.tenants.map((t) => `<tr><td><a href="#" data-a="open" data-id="${esc(t.id)}">${esc(t.name || t.id)}</a></td><td>${esc(PLANS[t.tier]?.label || t.tier)}</td><td>${statusTag(t.status)}</td><td>${t.contractManaged ? tag('managed', 'warn') : ''}</td><td>${esc(fmt(t.createdAt))}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">No businesses found.</td></tr>'}
    </tbody></table></div><p class="muted">${state.tenants.length} shown. Names are matched from the start, and case matters.</p>`;

  const featureSelect = (f, o) => {
    const v = (o.addFeatures || []).includes(f) ? 'add' : (o.removeFeatures || []).includes(f) ? 'remove' : '';
    return `<tr><td>${esc(FEATURE_LABELS[f] || f)}</td><td><select name="feat_${esc(f)}" ${can('write') ? '' : 'disabled'}>
      <option value="" ${v === '' ? 'selected' : ''}>Plan default</option><option value="add" ${v === 'add' ? 'selected' : ''}>Grant</option><option value="remove" ${v === 'remove' ? 'selected' : ''}>Remove</option></select></td></tr>`;
  };

  const detailView = () => {
    const { tenant: t, owners, memberCount, jobsThisMonth, month } = state.detail;
    const o = t.overrides || {};
    const b = t.branding || {};
    const eff = t.entitlements || resolveEntitlements(t.tier, o);
    const ro = can('write') ? '' : 'disabled';
    return `
    <p><a href="#" data-a="goto-list">← All businesses</a></p>
    <h2>${esc(t.name || t.id)} ${statusTag(t.status)} ${tag(PLANS[t.tier]?.label || t.tier)} ${o.contractManaged ? tag('contract managed', 'warn') : ''}</h2>
    <p class="muted">ID <code>${esc(t.id)}</code> · created ${esc(fmt(t.createdAt))} · owner ${owners.map((x) => esc(x.email || x.uid)).join(', ') || '—'} · ${memberCount} member(s) · ${jobsThisMonth} job(s) in ${esc(month)}</p>

    <div class="card"><h3>Billing</h3><div class="two"><div>Subscription: <code>${esc(t.billing.paystackSubscriptionCode || '—')}</code></div>
      <div>Customer: <code>${esc(t.billing.paystackCustomerCode || '—')}</code></div>
      <div>Next payment: ${esc(t.billing.nextPaymentDate ? fmt(Date.parse(t.billing.nextPaymentDate)) : '—')}</div>
      <div>Cancels at period end: ${t.billing.cancelAtPeriodEnd ? 'yes' : 'no'}</div></div>
      ${o.customPriceZar != null ? `<p>Custom price: <b>${esc(zar(o.customPriceZar))}</b>/month (record only; Paystack is not changed)</p>` : ''}</div>

    <div class="card"><h3>Status and plan</h3>
      <div class="two"><div><label>Status</label><div class="btns" style="margin-top:0">
        ${['active', 'suspended', 'cancelled'].filter((s) => s !== t.status).map((s) => `<button class="btn ${s === 'active' ? 'primary' : 'danger'}" data-a="status" data-s="${s}" ${can('status') ? '' : 'disabled'}>${s === 'active' ? 'Restore (active)' : 'Set ' + s}</button>`).join('')}</div></div>
      <div><label>Plan (does not touch Paystack)</label><div class="btns" style="margin-top:0">
        ${TIERS.map((x) => `<button class="btn ${x === t.tier ? 'primary' : ''}" data-a="tier" data-t="${x}" ${can('write') && x !== t.tier ? '' : 'disabled'}>${esc(PLANS[x].label)}</button>`).join('')}</div></div></div>
      <p class="muted">Suspended and cancelled businesses become read-only. A forced plan can be undone by a later Paystack event unless you tick “contract managed” below.</p></div>

    ${(() => {
      const tr = trialState(t);
      const text = tr.active ? `${tr.tier === 'business' ? 'Business' : 'Standard'} trial running: ${tr.daysLeft} day(s) left, ends ${esc(fmt(tr.endsAt))}.` : t.trial?.endedAt ? `Trial ended ${esc(fmt(t.trial.endedAt))}.` : tr.expired ? 'Trial has run out (it ends the next time the business opens the app).' : 'No trial.';
      return `<div class="card"><h3>Free trial</h3><p>${text}</p><div class="two"><div><label>Days to add</label><input id="trialDays" type="number" min="1" max="365" step="1" value="30" ${ro}>
        <label>Trial plan</label><select id="trialTier" ${ro}><option value="standard" ${(tr.tier || 'standard') === 'standard' ? 'selected' : ''}>Standard</option><option value="business" ${tr.tier === 'business' ? 'selected' : ''}>Business</option></select></div>
        <div class="btns" style="align-items:flex-end"><button class="btn" data-a="trial-extend" ${can('write') ? '' : 'disabled'}>Start / extend trial</button>
        <button class="btn danger" data-a="trial-end" ${can('write') && (tr.active || tr.expired) ? '' : 'disabled'}>End trial now</button></div></div>
        <p class="muted">Does not work on contract-managed or paying businesses.</p></div>`;
    })()}

    <form class="card" data-form="overrides"><h3>Limits, features and contract</h3>
      <p class="muted">Leave a limit blank to use the plan default. Use -1 for unlimited.</p>
      <div class="two">${LIMIT_KEYS.map((k) => `<div><label>${esc(LIMIT_LABELS[k] || k)} <span class="muted">(plan: ${esc(PLANS[t.tier].limits[k])})</span></label>
        <input name="lim_${esc(k)}" type="number" step="1" min="-1" value="${o.limits && o.limits[k] != null ? esc(o.limits[k]) : ''}" ${ro}></div>`).join('')}</div>
      <div class="scroll"><table class="t"><thead><tr><th>Feature</th><th>Override</th></tr></thead><tbody>${FEATURES.map((f) => featureSelect(f, o)).join('')}</tbody></table></div>
      <div class="two"><div><label>Custom price (ZAR / month, record only)</label><input name="price" type="number" min="0" step="0.01" value="${o.customPriceZar != null ? esc(o.customPriceZar) : ''}" ${ro}></div>
        <div><label class="inl"><input type="checkbox" name="managed" ${o.contractManaged ? 'checked' : ''} ${ro}> Contract managed (Paystack events cannot change this plan)</label></div></div>
      <label>Internal note</label><textarea name="note" rows="2" maxlength="500" ${ro}>${esc(o.note || '')}</textarea>
      <p class="muted">Effective now: ${eff.features.length} features; ${Object.entries(eff.limits).map(([k, v]) => `${esc(LIMIT_LABELS[k] || k)} ${v === -1 ? 'unlimited' : esc(v)}`).join(', ')}.</p>
      ${can('write') ? '<div class="btns"><button class="btn primary">Save overrides</button></div>' : '<p class="muted">Your role cannot edit overrides.</p>'}</form>

    <form class="card" data-form="branding"><h3>White label</h3>
      <p class="muted">Stored for this business. Showing it inside the app comes later.</p>
      <div class="two"><div><label>Display name</label><input name="displayName" value="${esc(b.displayName || t.name || '')}" maxlength="80" ${ro}></div>
        <div><label>Primary colour</label><input name="primaryColor" placeholder="#2f6bff" value="${esc(b.primaryColor || '')}" ${ro}></div>
        <div><label>Logo (https link)</label><input name="logoUrl" value="${esc(b.logoUrl || '')}" ${ro}></div>
        <div><label>Email “from” name</label><input name="emailFromName" value="${esc(b.emailFromName || '')}" ${ro}></div>
        <div><label>Custom domain</label><input name="customDomain" placeholder="app.example.com" value="${esc(b.customDomain || '')}" ${ro}></div></div>
      ${can('write') ? '<div class="btns"><button class="btn primary">Save branding</button></div>' : ''}</form>

    ${can('audit') ? `<div class="card"><h3>Recent changes</h3><div class="scroll">${auditTable(state.audit)}</div></div>` : ''}`;
  };

  const auditTable = (rows) => `<table class="t"><thead><tr><th>When</th><th>Action</th><th>Business</th><th>By</th><th>Detail</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(fmt(r.at))}</td><td>${esc(r.action)}</td><td><code>${esc(r.tenantId || '')}</code></td><td>${esc(r.actorRole || '')}<br><span class="muted">${esc(r.actorUid || '')}</span></td><td><pre>${esc(JSON.stringify(r.detail ?? {}, null, 1))}</pre></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing yet.</td></tr>'}</tbody></table>`;

  const auditView = () => `<h2>Audit log</h2><div class="card scroll">${auditTable(state.audit)}</div>`;

  const render = () => {
    window.__appReady = true;
    const body = state.view === 'detail' && state.detail ? detailView() : state.view === 'audit' ? auditView() : listView();
    root.innerHTML = shell(body);
  };

  // ---------- data ----------
  const loadList = async () => {
    const r = await busy(() => call({ action: 'listTenants', search: state.search, limit: 100 }));
    if (r) state.tenants = r.tenants;
    state.view = 'list'; render();
  };
  const loadDetail = async (id) => {
    const r = await busy(() => call({ action: 'getTenant', tenantId: id }));
    if (!r) return;
    state.detail = r;
    state.audit = can('audit') ? (await busy(() => call({ action: 'listAudit', tenantId: id, limit: 20 })))?.entries || [] : [];
    state.view = 'detail'; render();
  };
  const loadAudit = async () => {
    const r = await busy(() => call({ action: 'listAudit', limit: 200 }));
    if (r) state.audit = r.entries;
    state.view = 'audit'; render();
  };
  const reloadDetail = () => loadDetail(state.detail.tenant.id);

  // ---------- events ----------
  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    e.preventDefault();
    const a = el.dataset.a;
    const id = state.detail?.tenant.id;
    if (a === 'out') { await D.logOut(); }
    else if (a === 'verify') { await busy(() => D.sendVerification(), 'Verification email sent. Open it, click the link, then come back here.'); }
    else if (a === 'claim') {
      await busy(async () => {
        const u = await D.reloadUser();
        if (!u.emailVerified) throw new Error('Your email is not verified yet. Click the link in the email first.');
        await call({ action: 'claimAdmin' });
        const claims = (await u.getIdTokenResult(true)).claims;
        role = claims.platformRole;
        if (!PERMS[role]) throw new Error('Something went wrong. Sign out and in again.');
        await loadList();
      });
    }
    else if (a === 'goto-list') await loadList();
    else if (a === 'goto-audit') await loadAudit();
    else if (a === 'open') await loadDetail(el.dataset.id);
    else if (a === 'status') {
      const s = el.dataset.s;
      let reason = null;
      if (s !== 'active') { reason = prompt(`Reason for setting this business to "${s}" (saved in the audit log):`); if (reason === null) return; }
      else if (!confirm('Restore this business to active?')) return;
      if (await busy(() => call({ action: 'setStatus', tenantId: id, status: s, reason }), 'Status updated.')) await reloadDetail();
    } else if (a === 'trial-extend') {
      const days = Number(document.getElementById('trialDays').value);
      if (await busy(() => call({ action: 'extendTrial', tenantId: id, days, tier: document.getElementById('trialTier').value }), 'Trial updated.')) await reloadDetail();
    } else if (a === 'trial-end') {
      if (!confirm('End this trial now? The business moves to the Free plan.')) return;
      if (await busy(() => call({ action: 'endTrial', tenantId: id }), 'Trial ended.')) await reloadDetail();
    } else if (a === 'tier') {
      if (!confirm(`Force this business onto the ${PLANS[el.dataset.t].label} plan? Paystack is not changed.`)) return;
      if (await busy(() => call({ action: 'setTier', tenantId: id, tier: el.dataset.t }), 'Plan updated.')) await reloadDetail();
    }
  });

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const f = Object.fromEntries(new FormData(form));
    const kind = form.dataset.form;
    if (kind === 'login') {
      try { await D.signIn(f.email, f.pw); } catch (err) { root.innerHTML = loginView(err.message); }
    } else if (kind === 'search') {
      state.search = String(f.q || '').trim(); await loadList();
    } else if (kind === 'overrides') {
      const overrides = { limits: {}, addFeatures: [], removeFeatures: [], contractManaged: form.elements.managed.checked, note: f.note || '' };
      for (const k of LIMIT_KEYS) if (f['lim_' + k] !== '' && f['lim_' + k] != null) overrides.limits[k] = Number(f['lim_' + k]);
      for (const ft of FEATURES) { const v = f['feat_' + ft]; if (v === 'add') overrides.addFeatures.push(ft); if (v === 'remove') overrides.removeFeatures.push(ft); }
      overrides.customPriceZar = f.price === '' ? null : Number(f.price);
      if (!confirm('Save these overrides? They take effect immediately for this business.')) return;
      if (await busy(() => call({ action: 'setOverrides', tenantId: state.detail.tenant.id, overrides }), 'Overrides saved.')) await reloadDetail();
    } else if (kind === 'branding') {
      const branding = { displayName: f.displayName, logoUrl: f.logoUrl, primaryColor: f.primaryColor, emailFromName: f.emailFromName, customDomain: f.customDomain };
      if (await busy(() => call({ action: 'setBranding', tenantId: state.detail.tenant.id, branding }), 'Branding saved.')) await reloadDetail();
    }
  });

  D.onAuth(async (user) => {
    if (!user) { role = null; root.innerHTML = loginView(); window.__appReady = true; return; }
    const claims = (await user.getIdTokenResult(true)).claims;
    role = claims.platformRole;
    if (!PERMS[role]) { root.innerHTML = noAccess(user); window.__appReady = true; return; }
    await loadList();
  });
}
