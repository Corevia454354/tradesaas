import assert from 'node:assert/strict';
import { PLANS, PRICING, formatPrice, resolveEntitlements, TIERS } from '../public/shared/plans.js';

assert.deepEqual(TIERS, ['free', 'standard', 'business']);

// tiers nest: each paid tier includes everything in the one below
for (const f of PLANS.free.features) assert.ok(PLANS.standard.features.includes(f), `standard has ${f}`);
for (const f of PLANS.standard.features) assert.ok(PLANS.business.features.includes(f), `business has ${f}`);
assert.ok(!PLANS.standard.features.includes('hierarchy'));
assert.ok(PLANS.business.features.includes('hierarchy'));

// plain resolve
let e = resolveEntitlements('free');
assert.equal(e.tier, 'free');
assert.equal(e.limits.jobsPerMonth, 5);
assert.ok(!e.features.includes('accountingExport'));

// overrides: add/remove features, raise limits
e = resolveEntitlements('standard', {
  addFeatures: ['whiteLabel', 'tasks'],
  removeFeatures: ['clientChat'],
  limits: { seats: 25 },
});
assert.ok(e.features.includes('whiteLabel') && e.features.includes('tasks'));
assert.ok(!e.features.includes('clientChat'));
assert.equal(e.limits.seats, 25);
assert.equal(e.limits.storageMb, PLANS.standard.limits.storageMb);

// resolving must not mutate the shared plan definitions
resolveEntitlements('free', { addFeatures: ['whiteLabel'], limits: { seats: 99 } });
assert.ok(!PLANS.free.features.includes('whiteLabel'));
assert.equal(PLANS.free.limits.seats, 1);

assert.deepEqual(PRICING.standard, { amount: 399, currency: 'ZAR' });
assert.deepEqual(PRICING.business, { amount: 149, currency: 'USD', includedSeats: 20 });
assert.equal(PLANS.business.limits.seats, 20);
assert.equal(formatPrice(PRICING.business), 'US$149');
assert.equal(formatPrice(PRICING.standard), 'R399');
console.log('plans tests passed');

// ---- trial
import { trialState, TRIAL } from '../public/shared/plans.js';
{
  const day = 864e5, now = 1_000_000_000_000;
  assert.equal(TRIAL.days, 30);
  assert.deepEqual(trialState({}, now), { active: false, expired: false });
  assert.deepEqual(trialState({ trial: { active: false } }, now), { active: false, expired: false });
  assert.deepEqual(trialState({ trial: { active: true, endsAt: now + 30 * day } }, now), { active: true, expired: false, tier: 'standard', daysLeft: 30, endsAt: now + 30 * day });
  assert.equal(trialState({ trial: { active: true, tier: 'business', endsAt: now + 1 } }, now).tier, 'business');
assert.equal(trialState({ trial: { active: true, endsAt: now + 1 } }, now).daysLeft, 1); // part of a day counts as a day
  assert.equal(trialState({ trial: { active: true, endsAt: now + day + 1 } }, now).daysLeft, 2);
  assert.deepEqual(trialState({ trial: { active: true, endsAt: now } }, now), { active: false, expired: true, endsAt: now });
}
console.log('trial tests passed');
