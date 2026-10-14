// Single source of truth for tiers, limits and features.
// Imported by the browser app (public/app.js) and by the Vercel API routes (api/*).
// No secrets here: it is served publicly.

/** @typedef {'free'|'standard'|'business'} Tier */

export const PLANS = {
  free: {
    label: 'Free',
    limits: { jobsPerMonth: 5, seats: 1, storageMb: 200, smsCredits: 0 },
    features: ['quotes', 'jobs', 'certificates', 'invoices', 'esign'],
  },
  standard: {
    label: 'Standard',
    limits: { jobsPerMonth: -1, seats: 3, storageMb: 5000, smsCredits: 50 },
    features: ['quotes', 'jobs', 'certificates', 'invoices', 'esign', 'clientChat', 'accountingExport'],
  },
  business: {
    label: 'Business',
    limits: { jobsPerMonth: -1, seats: 20, storageMb: 50000, smsCredits: 200 },
    features: [
      'quotes', 'jobs', 'certificates', 'invoices', 'esign', 'clientChat', 'accountingExport',
      // team layer
      'hierarchy', 'tasks', 'workDocs', 'timeLeave', 'teamChat', 'jobCosting', 'teamReports', 'payroll',
      'docLibrary', 'support',
    ],
  },
};

// Extra features only a platform admin can grant: 'whiteLabel', 'customDomain'.

/**
 * Prices. `amount` is per month in `currency` ('ZAR' or 'USD'). The Paystack plans you create in the
 * dashboard must match these (same amount AND currency). Business is priced in US dollars.
 */
export const PRICING = {
  standard: { amount: 399, currency: 'ZAR' },
  business: { amount: 149, currency: 'USD', includedSeats: 20 },
};
export const formatPrice = (p) => (p.currency === 'USD' ? `US$${p.amount}` : `R${p.amount}`);

export const TIERS = Object.keys(PLANS);

/** Every feature flag that exists, including the extras only a platform admin can grant. */
export const FEATURES = [
  ...new Set([...Object.values(PLANS).flatMap((p) => p.features), 'whiteLabel', 'customDomain']),
];

/** Every limit a plan (or an override) can set. */
export const LIMIT_KEYS = Object.keys(PLANS.free.limits);

/**
 * Tier + per-business overrides -> what the business can actually do.
 * overrides: { limits?, addFeatures?, removeFeatures?, customPriceZar?, contractManaged?, note? }
 */
export function resolveEntitlements(tier, overrides) {
  const plan = PLANS[tier];
  const features = new Set(plan.features);
  (overrides?.addFeatures || []).forEach((f) => features.add(f));
  (overrides?.removeFeatures || []).forEach((f) => features.delete(f));
  return {
    tier,
    limits: { ...plan.limits, ...(overrides?.limits || {}) },
    features: [...features],
  };
}

/**
 * Every new business gets this many days of the Standard plan, no card needed. Any business can also start
 * one free Business trial of the same length (api/tenant.js startTrial), once.
 */
export const TRIAL = { days: 30, tier: 'standard' };
export const TRIAL_TIERS = ['standard', 'business'];

/** Trial status from a business document. */
export function trialState(tenant, now = Date.now()) {
  const tr = tenant?.trial;
  if (!tr?.active) return { active: false, expired: false };
  const ms = tr.endsAt - now;
  if (ms > 0) return { active: true, expired: false, tier: tr.tier || 'standard', daysLeft: Math.ceil(ms / 864e5), endsAt: tr.endsAt };
  return { active: false, expired: true, endsAt: tr.endsAt };
}
