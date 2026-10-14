import { db } from './firebase.js';
import { resolveEntitlements } from '../../public/shared/plans.js';

/**
 * End a business's trial if it is due (or if `force` is true). A business that is paying, or on a
 * contract, keeps its plan; everyone else drops to Free. Data is never deleted.
 * Returns true if anything changed.
 */
export async function expireTrial(tenantId, { force = false, now = Date.now() } = {}) {
  const ref = db.collection('tenants').doc(tenantId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const t = snap.data();
    if (!t.trial?.active) return false;
    if (!force && t.trial.endsAt > now) return false;

    const update = { 'trial.active': false, 'trial.endedAt': now };
    const paying = !!t.billing?.paystackSubscriptionCode;
    if (!paying && !t.overrides?.contractManaged) {
      update.tier = 'free';
      update.entitlements = resolveEntitlements('free', t.overrides);
    }
    tx.update(ref, update);
    return true;
  });
}
