// Pure rules for the document library and the support inbox. Used by the browser and by api/library.js,
// api/support.js, so what the screen shows and what the server enforces cannot drift apart.
import { dateKeyDiffDays } from './team.js';

export const LIB_CATEGORIES = {
  licence: 'Licence / registration', insurance: 'Insurance', tax: 'Tax / SARS', contract: 'Contract',
  policy: 'Policy / procedure', safety: 'Safety / compliance', template: 'Template', finance: 'Finance', other: 'Other',
};
/** Roles a document can be shared with (the owner always sees everything). */
export const SHARE_ROLES = ['dept_head', 'manager', 'employee'];
export const MAX_FILE_MB = 15;
export const FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt', 'pptx'];
export const EXPIRY_WARN_DAYS = 30;

export const fileExt = (name) => { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/); return m ? m[1] : ''; };
/** A name safe to use in a storage path and a download header. */
export const safeFileName = (name) => {
  const ext = fileExt(name);
  const base = String(name || 'file').replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'file';
  return ext ? `${base}.${ext}` : base;
};

/** Who may add documents: the owner, plus roles / people the owner chose. uploaders = { roles:[], uids:[] } */
export function canUpload(member, uploaders) {
  if (!member || member.status === 'inactive') return false;
  if (member.role === 'owner') return true;
  const u = uploaders || {};
  return (Array.isArray(u.roles) && u.roles.includes(member.role)) || (Array.isArray(u.uids) && u.uids.includes(member.uid));
}

/** Everyone who may open a document: the owner, the uploader, and the roles/people it was shared with. */
export function docVisibleTo(members, doc) {
  const out = new Set();
  const access = doc.access || {};
  for (const m of members.values ? members.values() : members) {
    if (m.status === 'inactive') continue;
    if (m.role === 'owner' || m.uid === doc.uploaderId) out.add(m.uid);
    else if ((access.roles || []).includes(m.role) || (access.uids || []).includes(m.uid)) out.add(m.uid);
  }
  return [...out];
}

/** 'none' | 'ok' | 'soon' | 'expired', with days left (negative once expired). */
export function expiryState(expiresOn, todayKey) {
  if (!expiresOn) return { state: 'none' };
  const days = dateKeyDiffDays(todayKey, expiresOn);
  if (days < 0) return { state: 'expired', days };
  if (days <= EXPIRY_WARN_DAYS) return { state: 'soon', days };
  return { state: 'ok', days };
}

// ---------------------------------------------------------------- support inbox
export const TICKET_STATUSES = { open: 'Open', pending: 'Waiting for customer', closed: 'Closed' };
/** Gmail's compose window, pre-filled. Needs no sign-in on our side: the person's own Gmail does the sending. */
export const gmailLink = ({ to, subject, body }) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const ticketRef = (n) => `#${String(n).padStart(4, '0')}`;
