import assert from 'node:assert/strict';
import { ValidationError, sanitizeOverrides, sanitizeBranding, sanitizeJob } from '../api/_lib/validate.js';
import { FEATURES, LIMIT_KEYS, PLANS } from '../public/shared/plans.js';

const throwsValidation = (fn) => assert.throws(fn, (e) => e instanceof ValidationError);

// feature / limit catalogues cover every plan plus the admin-only extras
for (const plan of Object.values(PLANS)) for (const f of plan.features) assert.ok(FEATURES.includes(f), f);
assert.ok(FEATURES.includes('whiteLabel') && FEATURES.includes('customDomain'));
assert.deepEqual([...LIMIT_KEYS].sort(), ['jobsPerMonth', 'seats', 'smsCredits', 'storageMb']);

// ---- overrides
assert.deepEqual(sanitizeOverrides(undefined), {});
assert.deepEqual(sanitizeOverrides(null), {});
assert.deepEqual(sanitizeOverrides({}), {});
assert.deepEqual(
  sanitizeOverrides({
    limits: { seats: 25, jobsPerMonth: -1 },
    addFeatures: ['whiteLabel', 'whiteLabel', 'tasks'],
    removeFeatures: ['clientChat'],
    customPriceZar: 1500,
    contractManaged: true,
    note: 'Annual deal',
  }),
  {
    limits: { seats: 25, jobsPerMonth: -1 },
    addFeatures: ['whiteLabel', 'tasks'],
    removeFeatures: ['clientChat'],
    customPriceZar: 1500,
    contractManaged: true,
    note: 'Annual deal',
  },
);
assert.deepEqual(sanitizeOverrides({ customPriceZar: null }), { customPriceZar: null });
assert.deepEqual(sanitizeOverrides({ evil: 1, __proto__: { x: 1 } }), {}); // unknown keys dropped
assert.equal(sanitizeOverrides({ contractManaged: 'yes' }).contractManaged, false); // only literal true counts
assert.equal(sanitizeOverrides({ note: 'x'.repeat(900) }).note.length, 500);

throwsValidation(() => sanitizeOverrides('nope'));
throwsValidation(() => sanitizeOverrides([]));
throwsValidation(() => sanitizeOverrides({ limits: { seats: '25' } }));
throwsValidation(() => sanitizeOverrides({ limits: { seats: 1.5 } }));
throwsValidation(() => sanitizeOverrides({ limits: { seats: -5 } }));
throwsValidation(() => sanitizeOverrides({ limits: { cats: 3 } }));
throwsValidation(() => sanitizeOverrides({ limits: [] }));
throwsValidation(() => sanitizeOverrides({ addFeatures: 'tasks' }));
throwsValidation(() => sanitizeOverrides({ addFeatures: ['teleport'] }));
throwsValidation(() => sanitizeOverrides({ removeFeatures: [1] }));
throwsValidation(() => sanitizeOverrides({ customPriceZar: -1 }));
throwsValidation(() => sanitizeOverrides({ customPriceZar: '99' }));

// ---- branding
assert.deepEqual(sanitizeBranding({ displayName: ' Sparky Electrical ' }), {
  displayName: 'Sparky Electrical', logoUrl: null, primaryColor: null, emailFromName: null, customDomain: null,
});
assert.deepEqual(
  sanitizeBranding({
    displayName: 'Sparky',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColor: '#0f766e',
    emailFromName: 'Sparky Billing',
    customDomain: 'App.Sparky.CO.za',
  }),
  {
    displayName: 'Sparky', logoUrl: 'https://cdn.example.com/logo.png', primaryColor: '#0f766e',
    emailFromName: 'Sparky Billing', customDomain: 'app.sparky.co.za',
  },
);
throwsValidation(() => sanitizeBranding(null));
throwsValidation(() => sanitizeBranding({}));
throwsValidation(() => sanitizeBranding({ displayName: '   ' }));
throwsValidation(() => sanitizeBranding({ displayName: 'x'.repeat(81) }));
throwsValidation(() => sanitizeBranding({ displayName: 'A', logoUrl: 'http://x.com/a.png' }));
throwsValidation(() => sanitizeBranding({ displayName: 'A', logoUrl: 'javascript:alert(1)' }));
throwsValidation(() => sanitizeBranding({ displayName: 'A', primaryColor: 'red' }));
throwsValidation(() => sanitizeBranding({ displayName: 'A', customDomain: 'not a domain' }));
throwsValidation(() => sanitizeBranding({ displayName: 'A', customDomain: 'localhost' }));
throwsValidation(() => sanitizeBranding({ displayName: 'A', customDomain: '-bad.example.com' }));

// ---- jobs
assert.deepEqual(sanitizeJob({ title: ' Rewire ', clientId: 'abc123' }), {
  title: 'Rewire', clientId: 'abc123', address: '', date: null, status: 'scheduled', notes: '', quoteId: null,
});
assert.deepEqual(
  sanitizeJob({ title: 'T', clientId: 'c', address: '1 Main', date: 1760000000000, status: 'in_progress', notes: 'n', quoteId: 'q1', createdAt: 5, evil: true }),
  { title: 'T', clientId: 'c', address: '1 Main', date: 1760000000000, status: 'in_progress', notes: 'n', quoteId: 'q1' },
); // createdAt and unknown fields are dropped
assert.equal(sanitizeJob({ title: 'T', clientId: 'c', notes: 'x'.repeat(5000) }).notes.length, 2000);
throwsValidation(() => sanitizeJob(null));
throwsValidation(() => sanitizeJob({}));
throwsValidation(() => sanitizeJob({ title: '', clientId: 'c' }));
throwsValidation(() => sanitizeJob({ title: 'x'.repeat(201), clientId: 'c' }));
throwsValidation(() => sanitizeJob({ title: 'T' }));
throwsValidation(() => sanitizeJob({ title: 'T', clientId: 'a/b' }));
throwsValidation(() => sanitizeJob({ title: 'T', clientId: 'c', status: 'archived' }));
throwsValidation(() => sanitizeJob({ title: 'T', clientId: 'c', date: '2026-10-10' }));
throwsValidation(() => sanitizeJob({ title: 'T', clientId: 'c', quoteId: '../x' }));

console.log('validate tests passed');
