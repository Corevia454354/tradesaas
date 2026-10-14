import { createHmac, timingSafeEqual } from 'node:crypto';
import { auth, db } from './_lib/firebase.js';
import { resolveEntitlements } from '../public/shared/plans.js';

// POST /api/paystack-webhook
// Set this URL in Paystack: Settings > API Keys & Webhooks > Live/Test Webhook URL.
// We read the RAW body (request.text()) because the signature covers the exact bytes.

function validSignature(raw, signature) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tierFromPlan(code) {
  if (code && code === process.env.PAYSTACK_PLAN_STANDARD) return 'standard';
  if (code && code === process.env.PAYSTACK_PLAN_BUSINESS) return 'business';
  return null;
}

/** Best effort: if Paystack refuses, log it and carry on. An admin can cancel it in the Paystack dashboard. */
async function disableOldSubscription(code, token) {
  try {
    const res = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, token }),
    });
    if (!res.ok) console.error('could not disable old subscription', code, res.status);
  } catch (e) {
    console.error('could not disable old subscription', code, e?.message);
  }
}

/** True when the event is about a subscription the business has already replaced. */
async function isOldSubscription(ref, data) {
  const current = (await ref.get()).data()?.billing?.paystackSubscriptionCode;
  return !!(data?.subscription_code && current && data.subscription_code !== current);
}

/** Which business does this Paystack event belong to? */
async function findTenantId(data) {
  if (data?.metadata?.tenantId) return data.metadata.tenantId;

  const code = data?.customer?.customer_code;
  if (code) {
    const q = await db.collection('tenants').where('billing.paystackCustomerCode', '==', code).limit(1).get();
    if (!q.empty) return q.docs[0].id;
  }

  const email = data?.customer?.email;
  if (email) {
    try {
      const user = await auth.getUserByEmail(email);
      return user.customClaims?.tenantId ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Set tier + recompute entitlements, respecting admin overrides and custom contracts. */
async function applyTier(tenantId, tier, extra = {}) {
  const ref = db.collection('tenants').doc(tenantId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const tenant = snap.data();

    const update = { ...extra };
    if (!tenant.overrides?.contractManaged) {
      update.tier = tier;
      update['trial.active'] = false; // paying (or ended) replaces any trial
      update.entitlements = resolveEntitlements(tier, tenant.overrides);
    }
    // A successful payment lifts past_due, but never lifts an admin suspension.
    if (tenant.status === 'past_due') update.status = 'active';
    tx.update(ref, update);
  });
}

export async function POST(request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-paystack-signature'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const { event, data } = payload;

  try {
    const tenantId = await findTenantId(data);
    if (!tenantId) return new Response('ignored', { status: 200 }); // nothing to attach it to

    const ref = db.collection('tenants').doc(tenantId);

    switch (event) {
      case 'charge.success': {
        const tier = data?.metadata?.tier ?? tierFromPlan(data?.plan?.plan_code);
        const extra = { 'billing.paystackCustomerCode': data?.customer?.customer_code ?? null };
        if (tier === 'standard' || tier === 'business') await applyTier(tenantId, tier, extra);
        else await ref.update(extra);
        break;
      }
      case 'subscription.create': {
        const tier = tierFromPlan(data?.plan?.plan_code);
        // Switching plans creates a second subscription; stop the old one so the customer is not billed twice.
        const before = (await ref.get()).data()?.billing;
        if (before?.paystackSubscriptionCode && before.paystackSubscriptionCode !== data?.subscription_code && before.paystackEmailToken) {
          await disableOldSubscription(before.paystackSubscriptionCode, before.paystackEmailToken);
        }
        const extra = {
          'billing.paystackCustomerCode': data?.customer?.customer_code ?? null,
          'billing.paystackSubscriptionCode': data?.subscription_code ?? null,
          'billing.paystackEmailToken': data?.email_token ?? null,
          'billing.nextPaymentDate': data?.next_payment_date ?? null,
          'billing.cancelAtPeriodEnd': false,
        };
        if (tier) await applyTier(tenantId, tier, extra);
        else await ref.update(extra);
        break;
      }
      case 'invoice.payment_failed': {
        const t = (await ref.get()).data();
        if (t.status === 'active') await ref.update({ status: 'past_due' });
        break;
      }
      case 'subscription.not_renew':
        if (await isOldSubscription(ref, data)) break;
        await ref.update({ 'billing.cancelAtPeriodEnd': true });
        break;
      case 'subscription.disable':
        if (await isOldSubscription(ref, data)) break; // an earlier plan ended after the customer switched; keep the new one
        // Subscription ended: back to Free. Data is kept, Free limits apply.
        await applyTier(tenantId, 'free', {
          'billing.paystackSubscriptionCode': null,
          'billing.paystackEmailToken': null,
          'billing.cancelAtPeriodEnd': false,
        });
        break;
      default:
        break;
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('paystack webhook failed', event, err);
    return new Response('error', { status: 500 }); // Paystack retries
  }
}
