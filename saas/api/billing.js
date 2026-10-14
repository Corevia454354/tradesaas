import { auth, db } from './_lib/firebase.js';
import { HttpError, handle, readBody, requireTenantOwner } from './_lib/http.js';
import { PRICING } from '../public/shared/plans.js';

// POST /api/billing  { action: 'checkout', tier: 'standard'|'business' }  |  { action: 'cancel' }

const PAYSTACK_API = 'https://api.paystack.co';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function paystack(path, body) {
  const res = await fetch(PAYSTACK_API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.status) {
    console.error('paystack error', path, json);
    throw new HttpError(502, `Payment provider error: ${json.message ?? res.statusText}`);
  }
  return json.data;
}

/** Owner picks a paid tier; returns a Paystack hosted-checkout URL. */
async function checkout(request) {
  const { uid, tenantId } = await requireTenantOwner(request);
  const { tier } = await readBody(request);
  if (tier !== 'standard' && tier !== 'business') throw new HttpError(400, 'tier must be "standard" or "business".');

  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  const t = tenantSnap.data();
  if (!tenantSnap.exists || !['active', 'past_due'].includes(t.status)) throw new HttpError(403, 'This account is suspended.');
  if (t.overrides?.contractManaged) throw new HttpError(400, 'Your plan is managed by contract. Contact us to change it.');
  if (t.tier === tier && t.billing?.paystackSubscriptionCode && !t.billing?.cancelAtPeriodEnd) {
    throw new HttpError(400, `You are already subscribed to ${tier === 'standard' ? 'Standard' : 'Business'}.`);
  }

  const user = await auth.getUser(uid);
  if (!user.email) throw new HttpError(400, 'Your account needs an email address.');

  const price = PRICING[tier];
  const plan = tier === 'standard' ? env('PAYSTACK_PLAN_STANDARD') : env('PAYSTACK_PLAN_BUSINESS');

  // With `plan` set, Paystack charges the plan's amount; `amount` is still required by the API.
  const init = await paystack('/transaction/initialize', {
    email: user.email,
    amount: price.amount * 100, // cents
    currency: price.currency,
    plan,
    callback_url: `${env('APP_URL').replace(/\/$/, '')}/billing/complete`,
    metadata: { tenantId, tier },
  });

  return { url: init.authorization_url, reference: init.reference };
}

/** Owner stops the subscription. Paystack sends subscription.disable when it ends. */
async function cancel(request) {
  const { tenantId } = await requireTenantOwner(request);
  const ref = db.collection('tenants').doc(tenantId);
  const { billing } = (await ref.get()).data();
  if (!billing?.paystackSubscriptionCode || !billing?.paystackEmailToken) {
    throw new HttpError(400, 'No active subscription.');
  }
  await paystack('/subscription/disable', {
    code: billing.paystackSubscriptionCode,
    token: billing.paystackEmailToken,
  });
  await ref.update({ 'billing.cancelAtPeriodEnd': true });
  return { ok: true };
}

export const POST = handle(async (request) => {
  const { action } = await request.clone().json().catch(() => ({}));
  if (action === 'checkout') return checkout(request);
  if (action === 'cancel') return cancel(request);
  throw new HttpError(400, 'Unknown action.');
});
