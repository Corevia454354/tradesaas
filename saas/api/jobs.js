import { db } from './_lib/firebase.js';
import { HttpError, handle, readBody, requireUser } from './_lib/http.js';
import { ValidationError, sanitizeJob } from './_lib/validate.js';
import { jobsLimitState, monthKeySAST } from '../public/lib.js';
import { PLANS } from '../public/shared/plans.js';
import { expireTrial } from './_lib/trial.js';

// POST /api/jobs  { data: { title, clientId, address?, date?, status?, notes?, quoteId? } }  ->  { id }
//
// Jobs are created here, not directly from the browser (firestore.rules refuses client-side job
// creation), so the plan's monthly job limit cannot be bypassed. The month's usage counter lives at
// tenants/{id}/usage/{YYYY-MM}; deleting a job does not free a slot.

export const POST = handle(async (request) => {
  const { claims } = await requireUser(request);
  const tenantId = claims.tenantId;
  if (!tenantId) throw new HttpError(403, 'Set up your business first.');
  if (!['owner', 'dept_head', 'manager'].includes(claims.role)) throw new HttpError(403, 'Only managers can create jobs.');

  const body = await readBody(request);
  let job;
  try {
    job = sanitizeJob(body.data);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }

  await expireTrial(tenantId); // a finished trial must not keep Standard limits
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) throw new HttpError(404, 'Business not found.');
  const tenant = tenantSnap.data();

  if (!['active', 'past_due'].includes(tenant.status)) throw new HttpError(403, 'This account is suspended.');
  if (!tenant.entitlements?.features?.includes('jobs')) throw new HttpError(403, 'Jobs are not part of your plan.');

  const client = await tenantRef.collection('clients').doc(job.clientId).get();
  if (!client.exists) throw new HttpError(400, 'That client does not exist.');

  const usageRef = tenantRef.collection('usage').doc(monthKeySAST());
  const jobRef = tenantRef.collection('jobs').doc();
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const usage = await tx.get(usageRef);
    const used = usage.exists ? usage.data().jobs || 0 : 0;
    const lim = jobsLimitState(tenant.entitlements.limits, used);
    if (lim.reached) {
      const plan = PLANS[tenant.tier]?.label ?? tenant.tier;
      throw new HttpError(403, `You've used all ${lim.max} jobs this month on the ${plan} plan. Upgrade to add more.`);
    }
    tx.set(usageRef, { jobs: used + 1, updatedAt: now }, { merge: true });
    tx.create(jobRef, { ...job, createdAt: now, updatedAt: now });
  });

  return { id: jobRef.id };
});
