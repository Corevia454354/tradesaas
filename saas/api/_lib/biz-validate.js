import { ValidationError } from './validate.js';
import { LIB_CATEGORIES, SHARE_ROLES, MAX_FILE_MB, FILE_EXTENSIONS, fileExt, safeFileName, TICKET_STATUSES } from '../../public/shared/library.js';
import { isDateKey } from '../../public/shared/team.js';
import { EMAIL } from './team-validate.js';
import { cleanEvent } from '../../public/shared/calendar.js';

// Pure input checks for /api/library and /api/support. Unit-tested in test/biz.test.mjs.
const bad = (m) => { throw new ValidationError(m); };
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const need = (v, label, max) => { const s = str(v, max + 1); if (!s) bad(`${label} is required.`); if (s.length > max) bad(`${label} is too long (${max} characters at most).`); return s; };
const id = (v, label) => { const s = str(v, 200); if (!s || s.includes('/')) bad(`${label} is missing.`); return s; };

export function sanitizeAccess(a) {
  if (a === undefined || a === null) return { roles: [], uids: [] };
  if (!isObj(a)) bad('Sharing details are invalid.');
  const roles = Array.isArray(a.roles) ? [...new Set(a.roles)] : [];
  if (roles.some((r) => !SHARE_ROLES.includes(r))) bad('Unknown role in sharing.');
  const uids = Array.isArray(a.uids) ? [...new Set(a.uids.map((u) => id(u, 'Person')))] : [];
  if (uids.length > 200) bad('Too many people chosen.');
  return { roles, uids };
}

const common = (i, { partial }) => {
  const out = {};
  if (!partial || i.title !== undefined) out.title = need(i.title, 'Title', 120);
  if (!partial || i.category !== undefined) { const c = i.category ?? 'other'; if (!LIB_CATEGORIES[c]) bad('Choose a type.'); out.category = c; }
  if (!partial || i.note !== undefined) out.note = str(i.note, 1000);
  if (!partial || i.expiresOn !== undefined) {
    if (!i.expiresOn) out.expiresOn = null; else { if (!isDateKey(i.expiresOn)) bad('Enter a valid expiry date.'); out.expiresOn = i.expiresOn; }
  }
  if (!partial || i.access !== undefined) out.access = sanitizeAccess(i.access);
  return out;
};

export function sanitizeUpload(i) {
  if (!isObj(i)) bad('Upload details are missing.');
  const name = need(i.name, 'File name', 200);
  if (!FILE_EXTENSIONS.includes(fileExt(name))) bad(`This file type is not allowed. Allowed: ${FILE_EXTENSIONS.join(', ')}.`);
  const size = i.size;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) bad('The file looks empty.');
  if (size > MAX_FILE_MB * 1024 * 1024) bad(`Files can be up to ${MAX_FILE_MB} MB.`);
  return { ...common({ ...i, title: i.title || name.replace(/\.[^.]*$/, '') }, { partial: false }), fileName: safeFileName(name), size: Math.round(size) };
}
export function sanitizeLink(i) {
  if (!isObj(i)) bad('Details are missing.');
  let url; try { url = new URL(String(i.link || '').trim()); } catch { bad('Enter a full web link starting with https://'); }
  if (url.protocol !== 'https:') bad('Links must start with https://');
  return { ...common(i, { partial: false }), link: url.toString().slice(0, 1000) };
}
export const sanitizeLibUpdate = (i) => { if (!isObj(i)) bad('Details are missing.'); return common(i, { partial: true }); };

export function sanitizeUploaders(i) {
  if (!isObj(i)) bad('Details are missing.');
  const roles = Array.isArray(i.roles) ? [...new Set(i.roles)] : [];
  if (roles.some((r) => !SHARE_ROLES.includes(r))) bad('Unknown role.');
  const uids = Array.isArray(i.uids) ? [...new Set(i.uids.map((u) => id(u, 'Person')))] : [];
  return { roles, uids };
}

// ---------------------------------------------------------------- support
export function sanitizeInquiry(i) {
  if (!isObj(i)) bad('Details are missing.');
  const email = str(i.email, 200).toLowerCase();
  if (!EMAIL.test(email)) bad('Enter a valid email address so we can reply.');
  return {
    name: need(i.name, 'Your name', 80), email, phone: str(i.phone, 40),
    subject: need(i.subject, 'Subject', 150), message: need(i.message, 'Message', 4000),
  };
}
export const sanitizeText = (v, label = 'Message', max = 4000) => need(v, label, max);
export function sanitizeStatus(v) { if (!TICKET_STATUSES[v]) bad('Unknown status.'); return v; }
export function sanitizeAgents(i) {
  if (!isObj(i) || !Array.isArray(i.uids)) bad('Choose who handles support.');
  if (i.uids.length > 50) bad('Too many people.');
  return [...new Set(i.uids.map((u) => id(u, 'Person')))];
}

// ---------------------------------------------------------------- calendar + profile picture
export function sanitizeEvent(i) {
  try { return cleanEvent(i); } catch (e) { throw new ValidationError(e.message); }
}
/** Who may post to the calendar: same shape as the library uploaders. */
export const sanitizePosters = sanitizeUploaders;

/** A profile picture is a small JPEG the browser already shrank (see public/ui.js). '' or null removes it. */
export const MAX_PHOTO_CHARS = 60000;
export function sanitizePhoto(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') bad('The picture is invalid.');
  if (v.length > MAX_PHOTO_CHARS) bad('That picture is too large. Choose a smaller one.');
  const m = v.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) bad('The picture must be a JPEG, PNG or WebP photo.');
  const head = Buffer.from(m[1].slice(0, 8), 'base64');
  if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) bad('That file is not a valid picture.');
  return v;
}
