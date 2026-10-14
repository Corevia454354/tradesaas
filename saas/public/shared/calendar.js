// Pure rules for the team calendar. Used by the browser and by api/calendar.js, so what the screen
// shows and what the server enforces cannot drift apart. Dates are plain "YYYY-MM-DD" keys in South African
// time, so there are no time-zone surprises. No Firebase, no DOM.
import { isDateKey } from './team.js';

export const EVENT_TYPES = {
  meeting: 'Meeting', deadline: 'Deadline', training: 'Training', site: 'Site visit',
  holiday: 'Public holiday / closed', social: 'Social', other: 'Other',
};
/** Colour class suffix for each type (see .ev-* in styles.css). */
export const EVENT_COLOURS = { meeting: 'blue', deadline: 'red', training: 'purple', site: 'amber', holiday: 'green', social: 'pink', other: 'grey' };

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_SPAN_DAYS = 31;

/** Who may put events on the calendar: the owner, plus roles / people the owner chose. posters = { roles:[], uids:[] } */
export function canPost(member, posters) {
  if (!member || member.status === 'inactive') return false;
  if (member.role === 'owner') return true;
  const p = posters || {};
  return (Array.isArray(p.roles) && p.roles.includes(member.role)) || (Array.isArray(p.uids) && p.uids.includes(member.uid));
}

// ---- date keys
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const key = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k, n) => key(utc(k) + n * 864e5);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
/** Monday of the week that contains k. */
export const weekStartKey = (k) => addDays(k, -((new Date(utc(k)).getUTCDay() + 6) % 7));
export const monthKey = (k) => k.slice(0, 7);
export const monthStartKey = (k) => `${k.slice(0, 7)}-01`;
export const addMonths = (k, n) => {
  const [y, m] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
export const daysInMonth = (k) => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** The weeks (Monday first) needed to show the month that contains k: array of 7-key arrays, 4 to 6 weeks. */
export function monthGrid(k) {
  const first = monthStartKey(k);
  const last = addDays(first, daysInMonth(first) - 1);
  const weeks = [];
  for (let w = weekStartKey(first); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return weeks;
}

// ---- events
/** Does the event touch this day? An event runs from `date` to `endDate` (same day when not set). */
export const onDay = (ev, k) => ev.date <= k && (ev.endDate || ev.date) >= k;
export const sortEvents = (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0) || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || String(a.startTime || '').localeCompare(String(b.startTime || '')) || String(a.title).localeCompare(String(b.title));
export const eventsOn = (events, k) => events.filter((e) => onDay(e, k)).sort(sortEvents);
/** "09:00 – 10:30", "From 09:00", "All day". */
export function timeLabel(ev) {
  if (ev.allDay || !ev.startTime) return 'All day';
  return ev.endTime ? `${ev.startTime} – ${ev.endTime}` : `From ${ev.startTime}`;
}
export const upcoming = (events, todayKey, n = 5) => events.filter((e) => (e.endDate || e.date) >= todayKey).sort(sortEvents).slice(0, n);

/** Check and clean an event from the browser. Throws Error(message) when something is wrong. */
export function cleanEvent(i) {
  const bad = (m) => { throw new Error(m); };
  if (i === null || typeof i !== 'object' || Array.isArray(i)) bad('Event details are missing.');
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const title = str(i.title, 121);
  if (!title) bad('Give the event a title.');
  if (title.length > 120) bad('The title is too long (120 characters at most).');
  const type = i.type ?? 'meeting';
  if (!EVENT_TYPES[type]) bad('Choose a type for the event.');
  if (!isDateKey(i.date)) bad('Enter a valid date.');
  const endDate = i.endDate ? i.endDate : i.date;
  if (!isDateKey(endDate)) bad('Enter a valid end date.');
  if (endDate < i.date) bad('The end date cannot be before the start date.');
  if (diffDays(i.date, endDate) >= MAX_SPAN_DAYS) bad(`An event can last up to ${MAX_SPAN_DAYS} days.`);
  const allDay = i.allDay === true || (!i.startTime && !i.endTime);
  let startTime = '', endTime = '';
  if (!allDay) {
    startTime = str(i.startTime, 5);
    endTime = str(i.endTime, 5);
    if (!TIME_RE.test(startTime)) bad('Enter a start time like 09:00.');
    if (endTime && !TIME_RE.test(endTime)) bad('Enter an end time like 10:30.');
    if (endTime && endDate === i.date && endTime <= startTime) bad('The end time must be after the start time.');
  }
  const description = str(i.description, 1000);
  const location = str(i.location, 120);
  return { title, type, date: i.date, endDate, allDay, startTime, endTime, location, description };
}

/** Same shape rules as the library: who may post. Roles can only be the three below the owner. */
export const POST_ROLES = ['dept_head', 'manager', 'employee'];
