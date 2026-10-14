// The team calendar screens (Business plan). Created by team-ui.js, which hands over its helpers.
// Everyone in the business reads every event. Only the owner and the people the owner chose can add events
// (the server decides, api/calendar.js); each person can change their own events, the owner can change any.
import * as T from './shared/team.js';
import * as X from './shared/calendar.js';
import { icon, kpi } from './ui.js';

export function createCalendarUI(ctx, h) {
  const { S, D, L, esc, fld, toast, nav, render } = ctx;
  const { uid, mem, isOwner, active, empty, back, av } = h;
  const cal = (action, extra = {}) => D.api('/api/calendar', { action, ...extra });
  const val = (f, n) => (f.elements[n]?.value ?? '').trim();
  const checked = (f, name) => [...f.querySelectorAll(`input[name=${name}]:checked`)].map((i) => i.value);
  const KINDS = ['cal-event', 'cal-posters'];
  const owns = (kind) => KINDS.includes(kind);
  const PAGES = ['calendar'];

  // ---------------------------------------------------------------- who may post
  const posters = () => S.calSettings?.posters || { roles: [], uids: [] };
  const me = () => ({ ...(mem(uid()) || {}), uid: uid(), role: S.role, status: 'active' });
  const canPost = () => X.canPost(me(), posters());
  const today = () => L.dateKeySAST();

  // ---------------------------------------------------------------- what is on the calendar
  const LAYERS = [['events', 'Team events'], ['jobs', 'Jobs'], ['tasks', 'My tasks'], ['leave', 'Leave']];
  const layers = () => ({ events: true, jobs: true, tasks: true, leave: true, ...(S.q.calLayers || {}) });
  const keyOf = (ms) => L.toDateInput(ms);
  function entries() {
    const ly = layers();
    const out = [];
    if (ly.events) {
      for (const e of S.events || []) out.push({ kind: 'event', id: e.id, title: e.title, date: e.date, endDate: e.endDate || e.date, allDay: e.allDay, startTime: e.startTime, endTime: e.endTime, colour: X.EVENT_COLOURS[e.type] || 'grey', href: `#/calendar/${e.id}`, sub: [X.EVENT_TYPES[e.type], e.location].filter(Boolean).join(' · ') });
    }
    if (ly.jobs) {
      for (const j of S.jobs || []) if (j.date && j.status !== 'done') { const k = keyOf(j.date); out.push({ kind: 'job', title: `Job: ${j.title}`, date: k, endDate: k, allDay: true, colour: 'teal', href: `#/jobs/${j.id}`, sub: ctx.clientName(j.clientId) }); }
    }
    if (ly.tasks) {
      for (const t of S.tasks || []) if (t.assigneeId === uid() && t.status !== 'done' && t.dueAt) { const k = keyOf(t.dueAt); out.push({ kind: 'task', title: `Due: ${t.title}`, date: k, endDate: k, allDay: true, colour: 'purple', href: `#/tasks/${t.id}`, sub: 'Your task' }); }
    }
    if (ly.leave) {
      for (const r of S.leave || []) if (r.status === 'approved') out.push({ kind: 'leave', title: `${r.name} off`, date: r.from, endDate: r.to, allDay: true, colour: 'grey', href: '#/leave', sub: T.LEAVE_TYPES[r.type] });
    }
    return out;
  }

  // ---------------------------------------------------------------- date helpers for the screen
  const dateOf = (k) => new Date(`${k}T12:00:00Z`);
  const fmt = (k, o) => dateOf(k).toLocaleDateString('en-ZA', { ...o, timeZone: 'UTC' });
  const monthTitle = (k) => fmt(k, { month: 'long', year: 'numeric' });
  const dayTitle = (k) => fmt(k, { weekday: 'long', day: 'numeric', month: 'long' });
  const range = (e) => (e.endDate && e.endDate !== e.date ? `${fmt(e.date, { day: 'numeric', month: 'short' })} to ${fmt(e.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : fmt(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const state = () => ({ view: S.q.calView || 'month', focus: S.q.calFocus || today(), sel: S.q.calSel || S.q.calFocus || today() });
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const pill = (e) => `<span class="cal-ev ev-${e.colour}" title="${esc(e.title)}">${e.allDay || !e.startTime ? '' : esc(e.startTime) + ' '}${esc(e.title)}</span>`;
  function agendaItem(e) {
    return `<a class="ag ev-${e.colour}" href="${esc(e.href)}"><div class="tm">${esc(X.timeLabel(e))}</div><div><div class="ti">${esc(e.title)}</div>${e.sub ? `<div class="sb">${esc(e.sub)}</div>` : ''}</div></a>`;
  }
  const dayList = (list) => (list.length ? `<div class="agenda">${list.map(agendaItem).join('')}</div>` : empty('Nothing on this day.'));

  function monthView(st, all) {
    const weeks = X.monthGrid(st.focus);
    const month = st.focus.slice(0, 7);
    const t = today();
    const cell = (k) => {
      const list = all.filter((e) => X.onDay(e, k)).sort(X.sortEvents);
      const cls = ['cal-cell', k.slice(0, 7) !== month ? 'out' : '', k === t ? 'today' : '', k === st.sel ? 'sel' : ''].join(' ');
      return `<div class="${cls}" data-action="cal-day" data-date="${k}" role="button" tabindex="0" aria-label="${esc(dayTitle(k))}, ${list.length} item${list.length === 1 ? '' : 's'}">
        <span class="cal-num">${Number(k.slice(8))}</span>${list.slice(0, 3).map(pill).join('')}${list.length > 3 ? `<div class="cal-more">+${list.length - 3} more</div>` : ''}
        <div class="cal-dots">${list.slice(0, 4).map((e) => `<i class="dot-${e.colour}"></i>`).join('')}</div></div>`;
    };
    return `<div class="cal"><div class="cal-dow">${DOW.map((d) => `<div>${d}</div>`).join('')}</div>${weeks.map((w) => `<div class="cal-week m">${w.map(cell).join('')}</div>`).join('')}</div>`;
  }
  function weekView(st, all) {
    const start = X.weekStartKey(st.focus);
    const t = today();
    return `<div class="cal"><div class="cal-week w">${Array.from({ length: 7 }, (_, i) => {
      const k = X.addDays(start, i);
      const list = all.filter((e) => X.onDay(e, k)).sort(X.sortEvents);
      return `<div class="wk ${k === t ? 'today' : ''}"><h5>${DOW[i]} ${Number(k.slice(8))}</h5>${list.map((e) => `<a class="cal-ev ev-${e.colour}" href="${esc(e.href)}">${e.allDay || !e.startTime ? '' : '<b>' + esc(e.startTime) + '</b> '}${esc(e.title)}</a>`).join('') || '<span class="muted" style="font-size:.75rem">—</span>'}</div>`;
    }).join('')}</div></div>`;
  }

  function viewCalendar(a) {
    if (a === 'new') return eventForm(null);
    if (a === 'who') return whoForm();
    if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a)) { S.q.calFocus = a; S.q.calSel = a; S.q.calView = 'month'; history.replaceState(null, '', '#/calendar'); a = undefined; }
    if (a) return eventDetail(a);
    const st = state();
    const all = entries();
    const title = st.view === 'month' ? monthTitle(st.focus) : st.view === 'week' ? `${fmt(X.weekStartKey(st.focus), { day: 'numeric', month: 'short' })} to ${fmt(X.addDays(X.weekStartKey(st.focus), 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : dayTitle(st.focus);
    const selList = all.filter((e) => X.onDay(e, st.sel)).sort(X.sortEvents);
    const ly = layers();
    const hasLeave = (S.leave || []).some((r) => r.status === 'approved');
    const main = st.view === 'month' ? monthView(st, all) : st.view === 'week' ? weekView(st, all) : dayList(all.filter((e) => X.onDay(e, st.focus)).sort(X.sortEvents));
    return `<div class="ph"><div><h1>Calendar</h1><p>${canPost() ? 'Everyone sees what you add here.' : 'Events your team has planned. Only people the owner chose can add events.'}</p></div>
      <div class="ph-act">${isOwner() ? '<a class="btn" href="#/calendar/who">Who can add events</a>' : ''}${canPost() ? `<a class="btn primary" href="#/calendar/new">${icon('plus', 18)}Add event</a>` : ''}</div></div>
      <div class="cal-bar"><div class="cal-nav"><button data-action="cal-prev" aria-label="Previous">${icon('left', 18)}</button><button data-action="cal-next" aria-label="Next">${icon('right', 18)}</button></div>
        <h2>${esc(title)}</h2><button class="btn sm" data-action="cal-today">Today</button><span class="sp"></span>
        <div class="viewsw">${[['month', 'Month'], ['week', 'Week'], ['day', 'Day']].map(([k, l]) => `<button class="${st.view === k ? 'on' : ''}" data-action="cal-view" data-view="${k}">${l}</button>`).join('')}</div></div>
      <div class="layers">${LAYERS.filter(([k]) => k !== 'leave' || hasLeave).map(([k, l]) => `<button class="${ly[k] ? 'on' : ''}" data-action="cal-layer" data-layer="${k}" aria-pressed="${ly[k]}">${ly[k] ? icon('check', 14) : ''}${l}</button>`).join('')}</div>
      ${main}
      ${st.view === 'month' ? `<div class="day-head"><h3>${esc(dayTitle(st.sel))}</h3>${canPost() ? `<a class="btn sm" href="#/calendar/new">${icon('plus', 16)}Add event</a>` : ''}</div>${dayList(selList)}` : ''}
      <div class="kpi-s" style="margin-top:1rem">Events from the last 90 days onwards are shown. Jobs show on their scheduled date, tasks on their due date.</div>`;
  }

  // ---------------------------------------------------------------- one event
  function eventDetail(id) {
    const e = (S.events || []).find((x) => x.id === id);
    if (!e) return `${back('#/calendar', 'Calendar')}<p class="muted">Loading… or this event no longer exists.</p>`;
    const mine = isOwner() || e.createdBy === uid();
    return `${back('#/calendar', 'Calendar')}<div class="ph"><div><h1>${esc(e.title)}</h1><p>${esc(range(e))}</p></div></div>
      <div class="card"><p><span class="badge ev-${X.EVENT_COLOURS[e.type] || 'grey'}" style="border-left:0">${esc(X.EVENT_TYPES[e.type] || 'Event')}</span> <b>${esc(X.timeLabel(e))}</b></p>
        ${e.location ? `<p>${icon('pin', 16)} ${esc(e.location)}</p>` : ''}
        ${e.description ? `<p style="white-space:pre-wrap">${esc(e.description)}</p>` : ''}
        <p class="muted" style="margin-bottom:0">Added by ${av(mem(e.createdBy) || { name: e.createdByName }, 'sm')} ${esc(e.createdByName)} on ${esc(L.fmtDate(e.createdAt))}</p></div>
      ${mine ? `<h3>Change this event</h3>${eventForm(e, true)}` : ''}`;
  }
  function eventForm(e, inline = false) {
    if (!canPost() && !e) return `${back('#/calendar', 'Calendar')}<p class="muted">The owner has not given you permission to add calendar events.</p>`;
    const d = e || { type: 'meeting', date: S.q.calSel || today(), endDate: '', allDay: false, startTime: '09:00', endTime: '10:00', title: '', location: '', description: '' };
    const form = `<form data-team="cal-event" data-id="${esc(e?.id || '')}"><fieldset>
      ${fld('Title', 'title', d.title, { required: true, attrs: 'maxlength="120"' })}
      ${fld('Type', 'type', d.type, { type: 'select', options: Object.entries(X.EVENT_TYPES) })}
      <div class="two-col even" style="gap:.6rem">${fld('Starts on', 'date', d.date, { type: 'date', required: true })}${fld('Ends on (optional)', 'endDate', d.endDate && d.endDate !== d.date ? d.endDate : '', { type: 'date' })}</div>
      <label class="check-f"><input type="checkbox" name="allDay" ${d.allDay ? 'checked' : ''}> All day (ignore the times below)</label>
      <div class="two-col even" style="gap:.6rem">${fld('Start time', 'startTime', d.startTime || '', { type: 'time' })}${fld('End time (optional)', 'endTime', d.endTime || '', { type: 'time' })}</div>
      ${fld('Place (optional)', 'location', d.location || '', { attrs: 'maxlength="120"' })}
      ${fld('Details (optional)', 'description', d.description || '', { type: 'textarea' })}</fieldset>
      <div class="bar"><button class="btn primary">${e ? 'Save changes' : 'Add to calendar'}</button>${e ? `<button type="button" class="btn danger" data-action="cal-delete" data-id="${esc(e.id)}">Delete event</button>` : ''}</div>
      ${e ? '' : '<p class="muted">Everyone in your business will see this on their calendar.</p>'}</form>`;
    return inline ? form : `${back('#/calendar', 'Calendar')}<div class="ph"><div><h1>Add an event</h1></div></div>${form}`;
  }

  // ---------------------------------------------------------------- the owner chooses who can add events
  function whoForm() {
    if (!isOwner()) return `${back('#/calendar', 'Calendar')}<p class="muted">Only the owner can choose this.</p>`;
    const p = posters();
    const others = active().filter((m) => m.role !== 'owner');
    return `${back('#/calendar', 'Calendar')}<div class="ph"><div><h1>Who can add events</h1><p>Everyone in the business can see the calendar. You choose who can put things on it.</p></div></div>
      <form data-team="cal-posters"><fieldset><h3>Whole roles</h3><div class="picks">${X.POST_ROLES.map((r) => `<label class="check-f"><input type="checkbox" name="role" value="${r}" ${(p.roles || []).includes(r) ? 'checked' : ''}> All ${esc(T.ROLE_LABEL[r].toLowerCase())}s</label>`).join('')}</div>
      <h3>Or specific people</h3><div class="picks">${others.map((m) => `<label class="check-f"><input type="checkbox" name="uid" value="${esc(m.uid)}" ${(p.uids || []).includes(m.uid) ? 'checked' : ''}> ${av(m, 'sm')} ${esc(m.name)} <span class="muted">${esc(T.ROLE_LABEL[m.role] || '')}</span></label>`).join('') || '<span class="muted">Add people to your team first.</span>'}</div></fieldset>
      <p class="muted">You can always add events. A person can change or delete only their own events; you can change any.</p>
      <div class="bar"><button class="btn primary">Save</button></div></form>`;
  }

  // ---------------------------------------------------------------- small pieces other screens use
  function upcomingCard() {
    const list = X.upcoming(S.events || [], today(), 4);
    const box = (e) => { const d = dateOf(e.date); return `<div class="datebox"><b>${d.getUTCDate()}</b><span>${d.toLocaleDateString('en-ZA', { month: 'short', timeZone: 'UTC' })}</span></div>`; };
    return `<div class="card"><div class="card-h"><h3>Coming up</h3><a href="#/calendar">Open calendar</a></div>${list.length
      ? list.map((e) => `<a class="up-ev" href="#/calendar/${esc(e.id)}">${box(e)}<div><b>${esc(e.title)}</b><div class="kpi-s">${esc(X.timeLabel(e))}${e.location ? ' · ' + esc(e.location) : ''}</div></div></a>`).join('')
      : '<div class="muted" style="padding:.4rem 0">Nothing on the calendar yet.</div>'}</div>`;
  }
  const todayCount = () => (S.events || []).filter((e) => X.onDay(e, today())).length;
  const attention = () => {
    const evs = (S.events || []).filter((e) => X.onDay(e, today())).sort(X.sortEvents);
    return evs.length ? [{ key: 'calendar', ic: 'calendar', text: evs.length === 1 ? `Today: ${evs[0].title}` : `${evs.length} events today`, sub: evs.length === 1 ? X.timeLabel(evs[0]) : evs.slice(0, 2).map((e) => e.title).join(', '), href: '#/calendar', n: 0 }] : [];
  };
  const tile = () => kpi({ ic: 'calendar', tone: 'purple', label: 'Events today', n: todayCount(), href: '#/calendar' });

  // ---------------------------------------------------------------- actions and forms
  const setFocus = (k) => { S.q.calFocus = k; S.q.calSel = k; };
  const step = (dir) => {
    const st = state();
    if (st.view === 'month') setFocus(X.addMonths(st.focus, dir));
    else if (st.view === 'week') setFocus(X.addDays(st.focus, 7 * dir));
    else setFocus(X.addDays(st.focus, dir));
    render();
  };
  const actions = {
    'cal-prev': () => step(-1),
    'cal-next': () => step(1),
    'cal-today': () => { setFocus(today()); render(); },
    'cal-view'(el) { S.q.calView = el.dataset.view; render(); },
    'cal-day'(el) { S.q.calSel = el.dataset.date; render(); },
    'cal-layer'(el) { S.q.calLayers = { ...layers(), [el.dataset.layer]: !layers()[el.dataset.layer] }; render(); },
    async 'cal-delete'(el) { if (!confirm('Delete this event for everyone?')) return; await cal('delete', { id: el.dataset.id }); toast('Event deleted'); nav('#/calendar'); },
  };
  async function submit(f, kind) {
    const id = f.dataset.id || '';
    if (kind === 'cal-posters') { await cal('setPosters', { data: { roles: checked(f, 'role'), uids: checked(f, 'uid') } }); toast('Saved'); return; }
    const data = { title: val(f, 'title'), type: val(f, 'type'), date: val(f, 'date'), endDate: val(f, 'endDate') || null, allDay: f.elements.allDay.checked, startTime: val(f, 'startTime'), endTime: val(f, 'endTime'), location: val(f, 'location'), description: val(f, 'description') };
    X.cleanEvent(data); // the same checks the server makes, so mistakes show up straight away
    if (id) { await cal('update', { id, data }); toast('Saved'); }
    else { await cal('create', { data }); S.q.calFocus = data.date; S.q.calSel = data.date; toast('Added to the calendar'); nav('#/calendar'); }
  }
  return { PAGES, owns, view: viewCalendar, actions, submit, upcomingCard, attention, tile, canPost };
}
