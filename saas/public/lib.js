// Pure helpers: no Firebase, no DOM. Unit-tested in node (see test/lib.test.mjs).

export const VAT_RATE = 0.15;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Round money to cents, half-up. toPrecision(12) strips binary float noise first, so
 * 37.575 (stored as 37.57499999999999…) correctly becomes 37.58 instead of 37.57.
 */
export const round2 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(Number((x * 100).toPrecision(12))) / 100 + 0; // "+ 0" turns -0 into 0
};

export const zar = (n) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(n) || 0);

/** Line items -> subtotal, VAT and total (rounded to cents). */
export function lineTotals(items = [], vatOn = false) {
  const sub = round2(items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.price) || 0), 0));
  const vat = vatOn ? round2(sub * VAT_RATE) : 0;
  return { sub, vat, total: round2(sub + vat) };
}

const p2 = (n) => String(n).padStart(2, '0');

/** e.g. INV-20261008-K3F9 */
export function docNumber(prefix, date = new Date(), rand = Math.random) {
  const suffix = Math.floor(rand() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
  return `${prefix}-${date.getFullYear()}${p2(date.getMonth() + 1)}${p2(date.getDate())}-${suffix}`;
}

export const startOfMonth = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), 1).getTime();

/** "2026-10": the calendar month in South Africa (UTC+2). Keys the monthly usage counter. */
export function monthKeySAST(now = Date.now()) {
  const d = new Date(now + 2 * 3600e3);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
}

/** limits.jobsPerMonth: -1 means unlimited. */
export function jobsLimitState(limits, used) {
  const max = limits?.jobsPerMonth ?? 0;
  if (max < 0) return { unlimited: true, reached: false, remaining: Infinity, max };
  return { unlimited: false, reached: used >= max, remaining: Math.max(0, max - used), max };
}

export const isOverdue = (inv, now = Date.now()) => inv.status === 'sent' && !!inv.dueAt && inv.dueAt < now;

export function toDateInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function fromDateInput(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/** WhatsApp click-to-chat link. South African numbers starting with 0 become 27... */
export function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '27' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/**
 * CSV for spreadsheets. Text starting with = + - @ would run as a formula in Excel or Sheets,
 * so it gets a leading apostrophe. Real numbers and phone numbers like +27... are left alone.
 */
export function toCsv(rows, cols) {
  const q = (v) => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^\+[\d\s()-]+$/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(','))].join('\r\n');
}

/** Only our own drawn signatures (strict base64 PNG data URLs) may reach an <img src>. */
export const safeImg = (s) => (typeof s === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : '');
export const safeUrl = (s) => (typeof s === 'string' && /^https:\/\//.test(s) ? s : '');

/**
 * Starter checklists per certificate type. These are a working layout only:
 * the legally prescribed certificate form (e.g. the SA electrical COC) must be
 * matched by a registered person before you rely on these for compliance.
 */
export const CERT_TYPES = {
  electrical: {
    label: 'Electrical Certificate of Compliance',
    checks: [
      'Earth continuity',
      'Insulation resistance',
      'Polarity of supply',
      'Earth leakage (RCD) trip test',
      'Main protective bonding',
      'Distribution board labelled and secure',
      'Visual inspection of wiring and accessories',
    ],
  },
  plumbing: {
    label: 'Plumbing Certificate of Compliance',
    checks: ['Pressure test', 'Leak test', 'Backflow prevention', 'Hot water temperature', 'Visual inspection'],
  },
  gas: {
    label: 'Gas Certificate of Conformity',
    checks: ['Tightness (leak) test', 'Ventilation adequate', 'Appliance connections', 'Flue / extraction', 'Isolation valve accessible'],
  },
  other: {
    label: 'Certificate of Compliance',
    checks: ['Visual inspection', 'Functional test', 'Compliance with applicable standard'],
  },
};

/** 'YYYY-MM-DD' for a moment in time, as the date it is in South Africa (UTC+2). */
export function dateKeySAST(now = Date.now()) {
  return new Date(now + 2 * 3600e3).toISOString().slice(0, 10);
}
