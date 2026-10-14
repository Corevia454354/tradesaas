// Business tier screens, part 2: the document library and the customer support inbox.
// Created by team-ui.js, which hands over its helpers. Every change goes through POST /api/library or
// /api/support (the server decides who may do what); the screens only read live data.
import * as T from './shared/team.js';
import * as X from './shared/library.js';
import { icon, kpi, fileChip } from './ui.js';

export function createBizUI(ctx, h) {
  const { S, D, L, esc, fld, badge, toast, nav, has, render } = ctx;
  const { uid, mem, isOwner, active, today, fmtDay, empty, head, back, byNewest, wa, av } = h;
  const lib = (action, extra = {}) => D.api('/api/library', { action, ...extra });
  const sup = (action, extra = {}) => D.api('/api/support', { action, ...extra });
  const checked = (f, name) => [...f.querySelectorAll(`input[name=${name}]:checked`)].map((i) => i.value);
  const val = (f, n) => (f.elements[n]?.value ?? '').trim();
  const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const when = (ms) => L.fmtDate(ms);
  const KINDS = ['lib-add', 'lib-link', 'lib-edit', 'lib-uploaders', 'sup-reply', 'sup-note', 'sup-agents'];
  const owns = (kind) => KINDS.includes(kind);

  // ---------------------------------------------------------------- navigation + home
  const agents = () => S.supportSettings?.agents || [];
  const isAgent = () => isOwner() || agents().includes(uid());
  const uploaders = () => S.libSettings?.uploaders || { roles: [], uids: [] };
  const canAdd = () => X.canUpload({ ...(mem(uid()) || {}), uid: uid(), role: S.role, status: 'active' }, uploaders());
  const navItems = () => [
    ...(has('docLibrary') ? [['library', 'Library']] : []),
    ...(has('support') && isAgent() ? [['support', 'Support']] : []),
  ];
  const PAGES = ['library', 'support'];
  const expiring = () => (S.library || []).filter((d) => d.status === 'ready' && d.expiresOn && (d.uploaderId === uid() || isOwner()) && X.expiryState(d.expiresOn, today()).state !== 'ok' && X.expiryState(d.expiresOn, today()).state !== 'none');
  const openTickets = () => (S.tickets || []).filter((t) => t.status !== 'closed');
  /** Stat tiles for the dashboard (an array of html). */
  function tiles() {
    const out = [];
    if (has('docLibrary') && (isOwner() || (S.library || []).some((d) => d.uploaderId === uid()))) {
      const n = expiring().length;
      out.push(kpi({ ic: 'folder', tone: 'amber', label: 'Documents expiring / expired', n, href: '#/library', warn: !!n }));
    }
    if (has('support') && isAgent()) {
      const mine = openTickets().filter((t) => t.assigneeId === uid()).length, fresh = openTickets().filter((t) => !t.assigneeId).length;
      out.push(kpi({ ic: 'support', tone: 'red', label: 'New inquiries', n: fresh, sub: mine ? `${mine} yours` : '', href: '#/support', warn: !!fresh }));
    }
    return out;
  }
  /** Items for the bell and the menu badges. */
  function attention() {
    const out = [];
    if (has('docLibrary')) {
      const n = expiring().length;
      if (n) out.push({ key: 'library', ic: 'folder', text: `${n} document${n === 1 ? '' : 's'} expiring or expired`, sub: 'Check the library', href: '#/library', warn: true, n });
    }
    if (has('support') && isAgent()) {
      const fresh = openTickets().filter((t) => !t.assigneeId).length;
      if (fresh) out.push({ key: 'support', ic: 'support', text: `${fresh} new customer inquir${fresh === 1 ? 'y' : 'ies'}`, sub: 'Nobody has taken them yet', href: '#/support', warn: true, n: fresh });
    }
    return out;
  }

  // ---------------------------------------------------------------- library
  const expiryBadge = (d) => {
    const e = X.expiryState(d.expiresOn, today());
    if (e.state === 'expired') return `<span class="badge b-overdue">Expired ${esc(fmtDay(d.expiresOn))}</span>`;
    if (e.state === 'soon') return `<span class="badge b-high">Expires in ${e.days} day${e.days === 1 ? '' : 's'}</span>`;
    return '';
  };
  const audienceText = (d) => {
    const a = d.access || {};
    const parts = [...(a.roles || []).map((r) => `all ${(T.ROLE_LABEL[r] || r).toLowerCase()}s`), ...(a.uids || []).map((u) => mem(u)?.name).filter(Boolean)];
    return parts.length ? `Owner, ${d.uploaderName}, ${parts.join(', ')}` : `Owner and ${d.uploaderName} only`;
  };
  function accessPicker(access = {}) {
    const others = active().filter((m) => m.role !== 'owner');
    return `<h3>Who can open it</h3><p class="muted">The owner and you can always open it.</p>
      <div class="picks">${X.SHARE_ROLES.map((r) => `<label class="check-f"><input type="checkbox" name="role" value="${r}" ${(access.roles || []).includes(r) ? 'checked' : ''}> All ${esc(T.ROLE_LABEL[r].toLowerCase())}s</label>`).join('')}</div>
      <p class="muted">And/or pick people:</p>
      <div class="picks">${others.map((m) => `<label class="check-f"><input type="checkbox" name="uid" value="${esc(m.uid)}" ${(access.uids || []).includes(m.uid) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('') || '<span class="muted">No other people yet.</span>'}</div>`;
  }
  const catOptions = Object.entries(X.LIB_CATEGORIES);
  function viewLibrary(a) {
    if (a === 'new') return libNew();
    if (a === 'who') return libWho();
    if (a) return libDetail(a);
    const filter = S.q.libFilter || 'all';
    let list = [...(S.library || [])].filter((d) => d.status === 'ready');
    if (filter === 'expiring') list = list.filter((d) => ['soon', 'expired'].includes(X.expiryState(d.expiresOn, today()).state));
    else if (filter !== 'all') list = list.filter((d) => d.category === filter);
    const text = (S.q.libSearch || '').toLowerCase();
    if (text) list = list.filter((d) => `${d.title} ${d.note} ${d.fileName || ''}`.toLowerCase().includes(text));
    list.sort(byNewest);
    const row = (d) => `<tr class="go" data-go="#/library/${esc(d.id)}"><td><div class="who">${fileChip(d.fileName, d.kind)}<div><a class="cell t1" href="#/library/${esc(d.id)}">${esc(d.title)}</a><div class="t2">${esc(X.LIB_CATEGORIES[d.category] || d.category)}${d.kind === 'file' ? ' · ' + esc(mb(d.size)) : ' · link'}</div></div></div></td>
      <td data-l="Added by"><span class="who">${av(d.uploaderId, 'sm')}${esc(d.uploaderName)}</span></td><td data-l="Date">${esc(when(d.createdAt))}</td><td data-l="Expires">${d.expiresOn ? esc(fmtDay(d.expiresOn)) + ' ' : '—'}${expiryBadge(d)}</td></tr>`;
    const cats = [['all', 'All'], ['expiring', 'Expiring'], ...catOptions];
    return `${head('Library', canAdd() ? `<a class="btn primary" href="#/library/new">${icon('plus', 18)}Add document</a>` : '', 'Business files such as licences, insurance, tax and policies. You only see what was shared with you.')}
      <div class="search"><input type="search" data-action-input="lib-search" id="lib-search" placeholder="Search by name" value="${esc(S.q.libSearch || '')}" aria-label="Search the library"></div>
      <div class="seg">${cats.map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-action="lib-filter" data-filter="${k}">${esc(l)}</button>`).join('')}</div>
      ${list.length ? `<div class="dt-wrap"><table class="dt"><thead><tr><th>Name</th><th>Added by</th><th>Date</th><th>Expires</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : empty('Nothing here yet.')}
      ${isOwner() ? '<p><a class="btn" href="#/library/who">Who is allowed to add documents</a></p>' : ''}`;
  }
  function libNew() {
    if (!canAdd()) return `${back('#/library', 'Library')}<p class="muted">The owner has not given you permission to add documents.</p>`;
    return `${back('#/library', 'Library')}<h2>Add a document</h2>
      <form data-team="lib-add"><fieldset>
      ${fld('File', 'file', '', { type: 'file', required: true, attrs: `accept=".${X.FILE_EXTENSIONS.join(',.')}"` })}
      <p class="muted">PDF, photos, Word, Excel, PowerPoint, CSV or text. Up to ${X.MAX_FILE_MB} MB.</p>
      ${fld('Name', 'title', '', { required: true })}${fld('Type', 'category', 'other', { type: 'select', options: catOptions })}
      ${fld('Expires on (optional)', 'expiresOn', '', { type: 'date' })}${fld('Note (optional)', 'note', '')}
      ${accessPicker()}</fieldset><div class="bar"><button class="btn primary">Upload</button></div></form>
      <details class="card"><summary><b>Or save a web link instead</b></summary><form data-team="lib-link">
      ${fld('Link (https)', 'link', '', { type: 'url', required: true })}${fld('Name', 'title', '', { required: true })}${fld('Type', 'category', 'other', { type: 'select', options: catOptions })}
      ${fld('Expires on (optional)', 'expiresOn', '', { type: 'date' })}${fld('Note (optional)', 'note', '')}${accessPicker()}<button class="btn">Save link</button></form></details>`;
  }
  function libDetail(id) {
    const d = (S.library || []).find((x) => x.id === id);
    if (!d || d.status !== 'ready') return `${back('#/library', 'Library')}<p class="muted">Loading… or this document is not shared with you.</p>`;
    const mine = isOwner() || d.uploaderId === uid();
    return `${back('#/library', 'Library')}<h2>${esc(d.title)}</h2>
      <div class="card"><p>${expiryBadge(d)} <span class="muted">${esc(X.LIB_CATEGORIES[d.category] || d.category)}${d.expiresOn ? ' · expires ' + esc(fmtDay(d.expiresOn)) : ''}</span></p>
      ${d.note ? `<p style="white-space:pre-wrap">${esc(d.note)}</p>` : ''}
      <p class="muted">Added by ${esc(d.uploaderName)} on ${esc(when(d.createdAt))}${d.kind === 'file' ? ` · ${esc(d.fileName)} · ${esc(mb(d.size))}` : ''}</p>
      <p class="muted">Who can open it: ${esc(audienceText(d))}</p>
      <div class="bar"><button class="btn primary" data-action="lib-open" data-id="${esc(d.id)}">${d.kind === 'link' ? 'Open link' : 'Download'}</button></div></div>
      ${mine ? `<h3>Change details</h3><form data-team="lib-edit" data-id="${esc(d.id)}"><fieldset>
        ${fld('Name', 'title', d.title, { required: true })}${fld('Type', 'category', d.category, { type: 'select', options: catOptions })}
        ${fld('Expires on', 'expiresOn', d.expiresOn || '', { type: 'date' })}${fld('Note', 'note', d.note || '')}${accessPicker(d.access)}</fieldset>
        <div class="bar"><button class="btn primary">Save</button><button type="button" class="btn danger" data-action="lib-delete" data-id="${esc(d.id)}">Delete</button></div></form>` : ''}`;
  }
  function libWho() {
    if (!isOwner()) return `${back('#/library', 'Library')}<p class="muted">Only the owner can choose this.</p>`;
    const u = uploaders();
    const others = active().filter((m) => m.role !== 'owner');
    return `${back('#/library', 'Library')}<h2>Who can add documents</h2>
      <p class="muted">You can always add documents. Choose who else can. Everyone you share a document with can open it, whether or not they can add their own.</p>
      <form data-team="lib-uploaders"><fieldset><h3>Whole roles</h3><div class="picks">${X.SHARE_ROLES.map((r) => `<label class="check-f"><input type="checkbox" name="role" value="${r}" ${(u.roles || []).includes(r) ? 'checked' : ''}> All ${esc(T.ROLE_LABEL[r].toLowerCase())}s</label>`).join('')}</div>
      <h3>Or specific people</h3><div class="picks">${others.map((m) => `<label class="check-f"><input type="checkbox" name="uid" value="${esc(m.uid)}" ${(u.uids || []).includes(m.uid) ? 'checked' : ''}> ${esc(m.name)} <span class="muted">${esc(T.ROLE_LABEL[m.role] || '')}</span></label>`).join('') || '<span class="muted">No other people yet.</span>'}</div></fieldset>
      <div class="bar"><button class="btn primary">Save</button></div></form>`;
  }

  // ---------------------------------------------------------------- support
  const publicLink = () => `${location.origin}/support?b=${encodeURIComponent(S.tid)}`;
  const tStat = { open: 'open', pending: 'in_progress', closed: 'done' };
  function viewSupport(a) {
    if (a === 'settings') return supSettings();
    if (a) return supDetail(a);
    const tab = S.q.supTab || 'new';
    let list = [...(S.tickets || [])];
    const tabs = [['new', 'Unassigned'], ['mine', 'Mine'], ['open', 'All open'], ['closed', 'Closed']];
    if (tab === 'new') list = list.filter((t) => !t.assigneeId && t.status !== 'closed');
    else if (tab === 'mine') list = list.filter((t) => t.assigneeId === uid() && t.status !== 'closed');
    else if (tab === 'open') list = list.filter((t) => t.status !== 'closed');
    else list = list.filter((t) => t.status === 'closed');
    list.sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0));
    const row = (t) => `<a class="row" href="#/support/${esc(t.id)}"><div class="main"><div class="t">${esc(X.ticketRef(t.number))} ${esc(t.subject)}</div>
      <div class="s">${esc(t.name)} · ${esc(when(t.lastAt))}${t.assigneeName ? ' · ' + esc(t.assigneeName) : ''}</div></div>${badge(tStat[t.status])}</a>`;
    return `${head('Support', isOwner() ? '<a class="btn" href="#/support/settings">Settings</a>' : '')}
      <div class="seg">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-action="sup-tab" data-tab="${k}">${l}</button>`).join('')}</div>
      ${list.length ? list.map(row).join('') : empty(tab === 'new' ? 'No new inquiries.' : 'Nothing here.')}
      ${isOwner() && !(S.tickets || []).length ? '<p class="muted">Customers send inquiries through your public support page. Open Settings to get the link.</p>' : ''}`;
  }
  function supSettings() {
    if (!isOwner()) return `${back('#/support', 'Support')}<p class="muted">Only the owner can change this.</p>`;
    const others = active().filter((m) => m.role !== 'owner');
    const link = publicLink();
    return `${back('#/support', 'Support')}<h2>Support settings</h2>
      <div class="card"><h3>Your public support page</h3><p class="muted">Put this link on your website, Facebook page, invoices or WhatsApp status. Anyone can send you a message from it. It never shows your other data.</p>
      <p id="support-link" style="word-break:break-all">${esc(link)}</p>
      <div class="bar"><button class="btn primary" data-action="sup-copy">Copy link</button><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(link)}">Open page</a>
      <a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(wa(`Need help? Send us a message here: ${link}`))}">Share on WhatsApp</a></div></div>
      <h3>Who answers customers</h3><p class="muted">You always can. Pick the people who may see and answer inquiries. Nobody else sees them.</p>
      <form data-team="sup-agents"><fieldset><div class="picks">${others.map((m) => `<label class="check-f"><input type="checkbox" name="uid" value="${esc(m.uid)}" ${agents().includes(m.uid) ? 'checked' : ''}> ${esc(m.name)} <span class="muted">${esc(T.ROLE_LABEL[m.role] || '')}</span></label>`).join('') || '<span class="muted">Add people to your team first.</span>'}</div></fieldset>
      <div class="bar"><button class="btn primary">Save</button></div></form>`;
  }
  function supDetail(id) {
    const t = (S.tickets || []).find((x) => x.id === id);
    if (!t) return `${back('#/support', 'Support')}<p class="muted">Loading… or this inquiry is not available to you.</p>`;
    const ref = X.ticketRef(t.number);
    const thread = (t.thread || []).map((m) => `<div class="msg ${m.type === 'note' ? 'note' : ''}"><b>${esc(m.name)}</b> <span class="muted">${m.type === 'customer' ? 'customer' : m.type === 'note' ? 'internal note' : 'reply' + (m.via === 'gmail' ? ' via Gmail' : '')} · ${esc(when(m.at))}</span><br><span style="white-space:pre-wrap">${esc(m.text)}</span></div>`).join('');
    const phone = (t.phone || '').replace(/[^\d+]/g, '');
    const owner = (S.members || []).find((m) => m.role === 'owner');
    const staff = [...(owner ? [owner] : []), ...active().filter((m) => agents().includes(m.uid))];
    return `${back('#/support', 'Support')}<h2>${esc(ref)} ${esc(t.subject)}</h2>
      <div class="card"><p>${badge(tStat[t.status])} <span class="muted">${esc(X.TICKET_STATUSES[t.status])}</span></p>
      <p><b>${esc(t.name)}</b> · <a href="mailto:${esc(t.email)}">${esc(t.email)}</a>${phone ? ` · <a href="tel:${esc(phone)}">${esc(t.phone)}</a> · <a target="_blank" rel="noopener noreferrer" href="https://wa.me/${esc(phone.replace(/^\+/, '').replace(/^0/, '27'))}">WhatsApp</a>` : ''}</p>
      <p class="muted">Handled by: <b>${esc(t.assigneeName || 'nobody yet')}</b></p>
      <div class="bar">${t.assigneeId === uid() ? '' : '<button class="btn primary" data-action="sup-claim" data-id="' + esc(t.id) + '">Take this one</button>'}
      ${t.status === 'closed' ? `<button class="btn" data-action="sup-status" data-id="${esc(t.id)}" data-status="open">Reopen</button>` : `<button class="btn" data-action="sup-status" data-id="${esc(t.id)}" data-status="closed">Close</button>`}</div>
      <label class="muted">Give to <select data-action-change="sup-assign" data-id="${esc(t.id)}"><option value="">—</option>${staff.map((m) => `<option value="${esc(m.uid)}" ${t.assigneeId === m.uid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label></div>
      <h3>Conversation</h3>${thread}
      <form data-team="sup-reply" data-id="${esc(t.id)}"><fieldset>${fld('Your reply to the customer', 'text', '', { type: 'textarea', required: true })}</fieldset>
      <div class="bar"><button class="btn primary" name="intent" value="gmail">Reply with Gmail</button><button type="button" class="btn" data-action="sup-reply-only" data-id="${esc(t.id)}">I replied another way</button></div>
      <p class="muted">“Reply with Gmail” opens Gmail with the customer's address and your text filled in. Press Send there. We also save your reply here so your team can see it.</p></form>
      <form data-team="sup-note" data-id="${esc(t.id)}" class="inline"><input name="text" placeholder="Internal note (customer never sees this)" maxlength="2000" required><button class="btn">Add note</button></form>`;
  }

  // ---------------------------------------------------------------- views / actions / forms
  function view(page, a) { return page === 'library' ? viewLibrary(a) : viewSupport(a); }
  const call2 = async (fn) => { try { await fn(); } catch (e) { toast(e.message, true); } };
  const actions = {
    'lib-filter'(el) { S.q.libFilter = el.dataset.filter; render(); },
    async 'lib-open'(el) {
      const win = window.open('', '_blank'); // opened now so the browser allows it; pointed at the file once the server answers
      try { const r = await lib('url', { id: el.dataset.id }); if (win) { win.opener = null; win.location = r.url; } else location.href = r.url; } catch (e) { win?.close(); toast(e.message, true); }
    },
    async 'lib-delete'(el) { if (!confirm('Delete this document for everyone?')) return; await lib('delete', { id: el.dataset.id }); nav('#/library'); toast('Deleted'); },
    'sup-tab'(el) { S.q.supTab = el.dataset.tab; render(); },
    async 'sup-claim'(el) { await sup('claim', { id: el.dataset.id }); toast('It is yours now'); },
    async 'sup-status'(el) { await sup('setStatus', { id: el.dataset.id, status: el.dataset.status }); toast('Updated'); },
    async 'sup-copy'() { try { await navigator.clipboard.writeText(publicLink()); toast('Link copied'); } catch { toast('Select the link and copy it', true); } },
    async 'sup-reply-only'(el) {
      const f = el.closest('form'); const text = val(f, 'text');
      if (!text) { toast('Write what you told the customer first.', true); return; }
      await sup('reply', { id: el.dataset.id, text, via: 'other' }); f.reset(); toast('Saved');
    },
  };
  // inputs that are not buttons
  document.addEventListener('input', (e) => { if (e.target?.id === 'lib-search') { S.q.libSearch = e.target.value; const pos = e.target.selectionStart; render(); const n = document.getElementById('lib-search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el?.dataset?.actionChange === 'sup-assign') call2(async () => { await sup('assign', { id: el.dataset.id, uid: el.value || null }); toast('Updated'); });
  });

  async function submit(f, kind, intent) {
    const id = f.dataset.id || '';
    const access = () => ({ roles: checked(f, 'role'), uids: checked(f, 'uid') });
    const meta = () => ({ title: val(f, 'title'), category: val(f, 'category'), note: val(f, 'note'), expiresOn: val(f, 'expiresOn') || null, access: access() });
    switch (kind) {
      case 'lib-add': {
        const file = f.elements.file.files[0];
        if (!file) throw new Error('Choose a file first.');
        const btn = f.querySelector('button.primary'); btn.disabled = true;
        try {
          toast('Uploading…');
          const r = await lib('prepare', { data: { ...meta(), name: file.name, size: file.size } });
          await D.uploadLibraryFile(r.path, file);
          await lib('finalize', { id: r.id });
        } finally { btn.disabled = false; }
        toast('Document saved'); nav('#/library');
        break;
      }
      case 'lib-link': await lib('addLink', { data: { ...meta(), link: val(f, 'link') } }); toast('Link saved'); nav('#/library'); break;
      case 'lib-edit': await lib('update', { id, data: meta() }); toast('Saved'); break;
      case 'lib-uploaders': await lib('setUploaders', { data: { roles: checked(f, 'role'), uids: checked(f, 'uid') } }); toast('Saved'); break;
      case 'sup-agents': await sup('setAgents', { uids: checked(f, 'uid') }); toast('Saved'); break;
      case 'sup-note': await sup('note', { id, text: val(f, 'text') }); f.reset(); break;
      case 'sup-reply': {
        const t = (S.tickets || []).find((x) => x.id === id);
        const text = val(f, 'text');
        if (!t || !text) throw new Error('Write your reply first.');
        const body = `${text}\n\n— ${mem(uid())?.name || ''}, ${S.tenant?.name || ''}`;
        // Open Gmail first (inside the click) so the browser does not block it, then record the reply.
        window.open(X.gmailLink({ to: t.email, subject: `Re: ${t.subject} [${X.ticketRef(t.number)}]`, body }), '_blank', 'noopener');
        await sup('reply', { id, text, via: 'gmail' }); f.reset(); toast('Reply saved. Press Send in Gmail.');
        break;
      }
      default: throw new Error('Unknown form');
    }
  }
  return { navItems, PAGES, tiles, attention, view, actions, owns, submit };
}
