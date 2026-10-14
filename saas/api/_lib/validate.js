import { FEATURES, LIMIT_KEYS } from '../../public/shared/plans.js';

// Pure input checks for the platform-admin API. No Firebase imports, so they are unit-tested
// in plain node (test/validate.test.mjs). Callers turn ValidationError into an HTTP 400.

export class ValidationError extends Error {}

const bad = (msg) => {
  throw new ValidationError(msg);
};
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Per-business overrides. Only known keys survive, so bad data can never reach billing. */
export function sanitizeOverrides(input) {
  if (input === undefined || input === null) return {};
  if (!isObj(input)) bad('overrides must be an object.');
  const out = {};

  if (input.limits !== undefined) {
    if (!isObj(input.limits)) bad('limits must be an object.');
    out.limits = {};
    for (const [k, v] of Object.entries(input.limits)) {
      if (!LIMIT_KEYS.includes(k)) bad(`Unknown limit: ${k}`);
      if (typeof v !== 'number' || !Number.isInteger(v) || v < -1) bad(`${k} must be a whole number (-1 means unlimited).`);
      out.limits[k] = v;
    }
  }

  for (const k of ['addFeatures', 'removeFeatures']) {
    if (input[k] === undefined) continue;
    if (!Array.isArray(input[k])) bad(`${k} must be a list.`);
    for (const f of input[k]) if (!FEATURES.includes(f)) bad(`Unknown feature: ${f}`);
    out[k] = [...new Set(input[k])];
  }

  if (input.customPriceZar === null) out.customPriceZar = null;
  else if (input.customPriceZar !== undefined) {
    if (typeof input.customPriceZar !== 'number' || !Number.isFinite(input.customPriceZar) || input.customPriceZar < 0) {
      bad('customPriceZar must be 0 or more.');
    }
    out.customPriceZar = input.customPriceZar;
  }

  if (input.contractManaged !== undefined) out.contractManaged = input.contractManaged === true;
  if (input.note !== undefined) out.note = String(input.note).slice(0, 500);
  return out;
}

const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** White-label settings for one business. */
export function sanitizeBranding(input) {
  if (!isObj(input)) bad('branding must be an object.');
  const displayName = String(input.displayName ?? '').trim();
  if (!displayName || displayName.length > 80) bad('displayName is required (80 characters at most).');

  const out = { displayName, logoUrl: null, primaryColor: null, emailFromName: null, customDomain: null };

  if (input.logoUrl) {
    const u = String(input.logoUrl).trim();
    if (!/^https:\/\/\S+$/.test(u) || u.length > 500) bad('logoUrl must be an https:// link.');
    out.logoUrl = u;
  }
  if (input.primaryColor) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(input.primaryColor))) bad('primaryColor must look like #0f766e.');
    out.primaryColor = String(input.primaryColor);
  }
  if (input.emailFromName) out.emailFromName = String(input.emailFromName).trim().slice(0, 80);
  if (input.customDomain) {
    const d = String(input.customDomain).trim().toLowerCase();
    if (!HOSTNAME.test(d)) bad('customDomain must be a hostname like app.example.com.');
    out.customDomain = d;
  }
  return out;
}

export const JOB_STATUSES = ['scheduled', 'in_progress', 'done'];

/** A new job from the browser. Only known fields survive, with sane types and sizes. */
export function sanitizeJob(input) {
  if (!isObj(input)) bad('Job details are missing.');
  const title = String(input.title ?? '').trim();
  if (!title || title.length > 200) bad('Job title is required (200 characters at most).');
  const clientId = String(input.clientId ?? '').trim();
  if (!clientId || clientId.length > 100 || clientId.includes('/')) bad('Choose a client.');
  const status = input.status ?? 'scheduled';
  if (!JOB_STATUSES.includes(status)) bad('Unknown job status.');
  let date = null;
  if (input.date !== null && input.date !== undefined) {
    if (typeof input.date !== 'number' || !Number.isFinite(input.date)) bad('Invalid date.');
    date = input.date;
  }
  const quoteId = input.quoteId ? String(input.quoteId).trim() : null;
  if (quoteId && (quoteId.length > 100 || quoteId.includes('/'))) bad('Invalid quote.');
  return {
    title,
    clientId,
    address: String(input.address ?? '').slice(0, 300),
    date,
    status,
    notes: String(input.notes ?? '').slice(0, 2000),
    quoteId,
  };
}
