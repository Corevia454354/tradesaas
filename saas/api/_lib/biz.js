import { auth, db } from './firebase.js';
import { HttpError } from './http.js';
import { requireUser } from './http.js';
import { ValidationError } from './validate.js';
import { isManagerRole } from '../../public/shared/team.js';

// Shared by the Business-tier routes (team, library, support): who is calling, which business, is the
// plan right, is the person active. Extracted from api/team.js.
const FEATURE_LABEL = {
  hierarchy: 'Team management', tasks: 'Tasks', workDocs: 'Work documents', timeLeave: 'Time and leave',
  teamChat: 'Team chat', jobCosting: 'Job costing', payroll: 'Payroll',
  docLibrary: 'The document library', support: 'Customer support',
};

export function valid(fn, ...a) {
  try { return fn(...a); } catch (e) { if (e instanceof ValidationError) throw new HttpError(400, e.message); throw e; }
}

export async function loadMembers(ref) {
  const snap = await ref.collection('members').get();
  return new Map(snap.docs.map((d) => [d.id, { uid: d.id, ...d.data() }]));
}

/** Who is calling, which business, is the plan right, is the person active. */
export async function ctx(request, feature) {
  const { uid, claims } = await requireUser(request);
  const tenantId = claims.tenantId;
  if (!tenantId) throw new HttpError(403, 'Set up your business first.');
  const ref = db.collection('tenants').doc(tenantId);
  const [tSnap, mSnap] = await Promise.all([ref.get(), ref.collection('members').doc(uid).get()]);
  if (!tSnap.exists || !mSnap.exists) throw new HttpError(403, 'You are not part of this business.');
  const tenant = tSnap.data();
  const me = { uid, ...mSnap.data() };
  if (!['active', 'past_due'].includes(tenant.status)) throw new HttpError(403, 'This account is suspended.');
  if (me.status === 'inactive') throw new HttpError(403, 'Your access has been turned off. Ask the business owner.');
  if (!tenant.entitlements?.features?.includes(feature)) {
    throw new HttpError(403, `${FEATURE_LABEL[feature] || 'This feature'} is part of the Business plan.`);
  }
  if (me.status === 'invited') { await mSnap.ref.update({ status: 'active' }); me.status = 'active'; }
  return { uid, tenantId, ref, tenant, me, isOwner: me.role === 'owner' };
}
export const ownerOnly = (c) => { if (!c.isOwner) throw new HttpError(403, 'Only the business owner can do this.'); };
export const managerOnly = (c) => { if (!isManagerRole(c.me.role)) throw new HttpError(403, 'Only managers can do this.'); };
export const live = (members, uid, label = 'person') => {
  const m = members.get(uid);
  if (!m || m.status === 'inactive') throw new HttpError(400, `That ${label} was not found.`);
  return m;
};
/** You can act for yourself and for people below you. The owner can act for anyone. */
export const canActFor = (c, target) => c.isOwner || target.uid === c.uid || (target.ancestors || []).includes(c.uid);

export async function getDoc(ref, col, id, label) {
  if (typeof id !== 'string' || !id || id.includes('/')) throw new HttpError(400, `${label} is missing.`);
  const snap = await ref.collection(col).doc(id).get();
  if (!snap.exists) throw new HttpError(404, `${label} not found.`);
  return { ref: snap.ref, id: snap.id, ...snap.data() };
}

export async function requireJob(ref, jobId) {
  if (!jobId) return null;
  const j = await ref.collection('jobs').doc(jobId).get();
  if (!j.exists) throw new HttpError(400, 'That job does not exist.');
  return { id: j.id, ...j.data() };
}

export async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((f) => f(batch));
    await batch.commit();
  }
}

