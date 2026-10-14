import { auth, db } from './firebase.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wrap a handler: JSON in, JSON out, HttpError -> proper status, anything else -> 500. */
export function handle(fn) {
  return async (request) => {
    try {
      return Response.json(await fn(request));
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: 'Server error' }, { status: 500 });
    }
  };
}

export async function readBody(request) {
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}

/** Verify the Firebase ID token sent as `Authorization: Bearer <token>`. */
export async function requireUser(request) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) throw new HttpError(401, 'Sign in first.');
  try {
    const token = await auth.verifyIdToken(m[1], true);
    return { uid: token.uid, claims: token };
  } catch {
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }
}

/** Business owner: returns { uid, tenantId }. */
export async function requireTenantOwner(request) {
  const { uid, claims } = await requireUser(request);
  if (!claims.tenantId || claims.role !== 'owner') {
    throw new HttpError(403, 'Business owner access required.');
  }
  return { uid, tenantId: claims.tenantId };
}

/**
 * Platform admin (your side). Reads the role fresh from Firebase Auth, not the
 * token, so removing someone's role takes effect immediately.
 */
export async function requirePlatformRole(request, allowed = ['super_admin']) {
  const { uid } = await requireUser(request);
  const user = await auth.getUser(uid);
  const role = user.customClaims?.platformRole;
  if (!role || !allowed.includes(role)) throw new HttpError(403, 'Platform admin access required.');
  return { uid, role };
}

/** Every platform admin action is recorded. */
export async function writeAudit(entry) {
  await db.collection('auditLogs').add({ ...entry, at: Date.now() });
}
