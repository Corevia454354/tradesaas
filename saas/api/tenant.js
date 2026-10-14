import { auth, db } from './_lib/firebase.js';
import { HttpError, handle, readBody, requireUser } from './_lib/http.js';
import { resolveEntitlements, TRIAL, TRIAL_TIERS } from '../public/shared/plans.js';
import { expireTrial } from './_lib/trial.js';
import { sanitizePhoto } from './_lib/biz-validate.js';
import { ValidationError } from './_lib/validate.js';

// POST /api/tenant   { action: 'create', name }  |  { action: 'checkTrial' }

async function createTenant(request) {
  const { uid } = await requireUser(request);
  const { name: rawName, ownerName: rawOwner } = await readBody(request);
  const name = String(rawName ?? '').trim();
  const ownerName = String(rawOwner ?? '').trim().slice(0, 60);
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your business name.');

  const user = await auth.getUser(uid);

  // ownerIndex/{uid} is written together with the business, so a retry or a double-click can never
  // create a second one. If an earlier attempt created the business but died before setting the
  // claims, finish that job instead of failing.
  const indexRef = db.doc(`ownerIndex/${uid}`);
  const existing = await indexRef.get();
  if (existing.exists) {
    const tenantId = existing.data().tenantId;
    await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), tenantId, role: 'owner' });
    return { tenantId };
  }
  if (user.customClaims?.tenantId) throw new HttpError(409, 'This account already belongs to a business.');

  const tenantRef = db.collection('tenants').doc();
  const now = Date.now();

  const batch = db.batch();
  batch.create(indexRef, { tenantId: tenantRef.id, createdAt: now });
  batch.set(tenantRef, {
    name,
    ownerUid: uid,
    status: 'active',
    tier: TRIAL.tier,
    entitlements: resolveEntitlements(TRIAL.tier),
    trial: { active: true, tier: TRIAL.tier, startedAt: now, endsAt: now + TRIAL.days * 864e5 },
    trialsUsed: { standard: true },
    billing: {},
    createdAt: now,
  });
  batch.set(tenantRef.collection('members').doc(uid), {
    uid,
    email: user.email ?? '',
    name: ownerName.length >= 2 ? ownerName : (user.displayName ?? name),
    role: 'owner',
    managerId: null,
    ancestors: [],
    status: 'active',
    createdAt: now,
  });
  try {
    await batch.commit();
  } catch (e) {
    if (e?.code === 6) throw new HttpError(409, 'Your business is already being set up. Refresh the page.'); // ALREADY_EXISTS
    throw e;
  }

  await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), tenantId: tenantRef.id, role: 'owner' });

  // The browser must call getIdToken(true) to pick up the new claims.
  return { tenantId: tenantRef.id };
}

/** The owner starts their one free Business trial (30 days, no card). */
async function startBusinessTrial(request) {
  const { claims } = await requireUser(request);
  if (!claims.tenantId || claims.role !== 'owner') throw new HttpError(403, 'Only the business owner can start a trial.');
  const ref = db.collection('tenants').doc(claims.tenantId);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Business not found.');
    const t = snap.data();
    if (!['active', 'past_due'].includes(t.status)) throw new HttpError(403, 'This account is suspended.');
    if (t.overrides?.contractManaged) throw new HttpError(400, 'Your plan is managed by contract. Contact us to change it.');
    if (t.billing?.paystackSubscriptionCode) throw new HttpError(400, 'You already pay for a plan. Switch plans from the billing page.');
    if (t.trialsUsed?.business) throw new HttpError(400, 'You have already used your free Business trial.');
    if (t.tier === 'business') throw new HttpError(400, 'You already have the Business plan.');
    tx.update(ref, {
      tier: 'business', entitlements: resolveEntitlements('business', t.overrides),
      trial: { active: true, tier: 'business', startedAt: now, endsAt: now + TRIAL.days * 864e5 },
      'trialsUsed.business': true,
    });
  });
  return { ok: true, endsAt: now + TRIAL.days * 864e5 };
}

/** Your own profile (any plan): a small profile picture and/or the name people see. */
async function setProfile(request) {
  const { uid, claims } = await requireUser(request);
  if (!claims.tenantId) throw new HttpError(403, 'Set up your business first.');
  const body = await request.clone().json().catch(() => ({}));
  const upd = {};
  try {
    if (Object.hasOwn(body, 'photo')) { upd.photo = sanitizePhoto(body.photo); upd.photoAt = Date.now(); }
    if (Object.hasOwn(body, 'name')) {
      const name = String(body.name ?? '').trim();
      if (name.length < 2 || name.length > 60) throw new ValidationError('Your name must be 2 to 60 characters.');
      upd.name = name;
    }
  } catch (e) { if (e instanceof ValidationError) throw new HttpError(400, e.message); throw e; }
  if (!Object.keys(upd).length) throw new HttpError(400, 'Nothing to change.');
  const ref = db.collection('tenants').doc(claims.tenantId).collection('members').doc(uid);
  if (!(await ref.get()).exists) throw new HttpError(403, 'You are not part of this business.');
  await ref.update(upd);
  if (upd.name) await auth.updateUser(uid, { displayName: upd.name }).catch(() => {});
  return { ok: true };
}

export const POST = handle(async (request) => {
  // Clone so each branch can read the body once.
  const { action } = await request.clone().json().catch(() => ({}));
  if (action === 'create') return createTenant(request);
  if (action === 'checkTrial') {
    const { claims } = await requireUser(request);
    if (!claims.tenantId) throw new HttpError(403, 'Set up your business first.');
    return { changed: await expireTrial(claims.tenantId) };
  }
  if (action === 'setProfile') return setProfile(request);
  if (action === 'startTrial') {
    const { tier } = await request.clone().json().catch(() => ({}));
    if (tier !== 'business' || !TRIAL_TIERS.includes(tier)) throw new HttpError(400, 'Only a Business trial can be started here.');
    return startBusinessTrial(request);
  }
  throw new HttpError(400, 'Unknown action.');
});
