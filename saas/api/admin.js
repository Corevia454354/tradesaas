import { db, auth } from './_lib/firebase.js';
import { HttpError, handle, readBody, requirePlatformRole, requireUser, writeAudit } from './_lib/http.js';
import { ValidationError, sanitizeBranding, sanitizeOverrides } from './_lib/validate.js';
import { PLANS, resolveEntitlements, TRIAL } from '../public/shared/plans.js';
import { expireTrial } from './_lib/trial.js';
import { monthKeySAST } from '../public/lib.js';

// POST /api/admin  { action, ...args }   Platform admins only. Every change is audited.
//   listTenants   { search?, limit? }                       super_admin, support, billing, read_only
//   setOverrides  { tenantId, overrides }                   super_admin
//   setTier       { tenantId, tier }                        super_admin
//   setStatus     { tenantId, status, reason? }             super_admin, support
//   setBranding   { tenantId, branding }                    super_admin
//   claimAdmin    {}                                        a signed-in user whose VERIFIED email is in PLATFORM_ADMIN_EMAILS
//   extendTrial   { tenantId, days, tier? }                 super_admin (starts or extends a trial; tier standard|business)
//   endTrial      { tenantId }                              super_admin
//   getTenant     { tenantId }                              any platform role
//   listAudit     { tenantId?, limit? }                     super_admin

const STATUSES = ['active', 'past_due', 'suspended', 'cancelled'];

/** Run a sanitizer and turn its ValidationError into an HTTP 400. */
function valid(sanitize, input) {
  try {
    return sanitize(input);
  } catch (e) {
    if (e instanceof ValidationError) throw new HttpError(400, e.message);
    throw e;
  }
}

async function getTenant(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpError(400, 'tenantId is required.');
  const ref = db.collection('tenants').doc(tenantId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Business not found.');
  return { ref, tenant: snap.data() };
}

const ACTIONS = {
  /** First-time setup without a terminal: the emails in PLATFORM_ADMIN_EMAILS can make themselves super_admin. */
  async claimAdmin(request) {
    const { uid, claims } = await requireUser(request);
    const allowed = String(process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    const email = String(claims.email || '').toLowerCase();
    if (!allowed.length || !allowed.includes(email)) throw new HttpError(403, 'This email is not on the admin list.');
    if (claims.email_verified !== true) throw new HttpError(403, 'Verify your email first (check your inbox), then try again.');
    const user = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), platformRole: 'super_admin' });
    await writeAudit({ actorUid: uid, actorRole: 'super_admin', action: 'platform.claim_admin', tenantId: null, detail: { email } });
    return { ok: true };
  },

  async listTenants(request, args) {
    await requirePlatformRole(request, ['super_admin', 'support', 'billing', 'read_only']);
    const limit = Math.min(Number(args.limit ?? 50) || 50, 200);
    const search = String(args.search ?? '').trim();

    let q = db.collection('tenants').orderBy('name').limit(limit); // alphabetical
    if (search) q = q.startAt(search).endAt(search + ''); // name-prefix search

    const snap = await q.get();
    return {
      tenants: snap.docs.map((d) => {
        const t = d.data();
        return {
          id: d.id,
          name: t.name,
          status: t.status,
          tier: t.tier,
          contractManaged: !!t.overrides?.contractManaged,
          createdAt: t.createdAt,
        };
      }),
    };
  },

  async setOverrides(request, args) {
    const { uid, role } = await requirePlatformRole(request, ['super_admin']);
    const { ref, tenant } = await getTenant(args.tenantId);
    const overrides = valid(sanitizeOverrides, args.overrides);

    await ref.update({ overrides, entitlements: resolveEntitlements(tenant.tier, overrides) });
    await writeAudit({ actorUid: uid, actorRole: role, action: 'tenant.set_overrides', tenantId: ref.id, detail: { overrides } });
    return { ok: true };
  },

  async setTier(request, args) {
    const { uid, role } = await requirePlatformRole(request, ['super_admin']);
    const { ref, tenant } = await getTenant(args.tenantId);
    if (!Object.hasOwn(PLANS, args.tier)) throw new HttpError(400, 'Unknown tier.');

    await ref.update({ tier: args.tier, entitlements: resolveEntitlements(args.tier, tenant.overrides) });
    await writeAudit({ actorUid: uid, actorRole: role, action: 'tenant.set_tier', tenantId: ref.id, detail: { from: tenant.tier, to: args.tier } });
    return { ok: true };
  },

  async setStatus(request, args) {
    const { uid, role } = await requirePlatformRole(request, ['super_admin', 'support']);
    const { ref, tenant } = await getTenant(args.tenantId);
    if (!STATUSES.includes(args.status)) throw new HttpError(400, 'Unknown status.');

    await ref.update({ status: args.status });
    await writeAudit({
      actorUid: uid,
      actorRole: role,
      action: 'tenant.set_status',
      tenantId: ref.id,
      detail: { from: tenant.status, to: args.status, reason: args.reason ?? null },
    });
    return { ok: true };
  },

  async setBranding(request, args) {
    const { uid, role } = await requirePlatformRole(request, ['super_admin']);
    const { ref } = await getTenant(args.tenantId);
    const branding = valid(sanitizeBranding, args.branding);

    await ref.update({ branding });
    await writeAudit({ actorUid: uid, actorRole: role, action: 'tenant.set_branding', tenantId: ref.id, detail: { branding } });
    return { ok: true };
  },

  async extendTrial(request, args) {
    const { uid, role } = await requirePlatformRole(request, ['super_admin']);
    const { ref, tenant } = await getTenant(args.tenantId);
    const days = args.days;
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, 'days must be a whole number from 1 to 365.');
    if (tenant.overrides?.contractManaged) throw new HttpError(400, 'This business is managed by contract. Change its plan with overrides instead.');
    if (tenant.billing?.paystackSubscriptionCode) throw new HttpError(400, 'This business already pays for a plan.');
    if (args.tier !== undefined && !['standard', 'business'].includes(args.tier)) throw new HttpError(400, 'tier must be standard or business.');
    const now = Date.now();
    const base = tenant.trial?.active && tenant.trial.endsAt > now ? tenant.trial.endsAt : now;
    const endsAt = base + days * 864e5;
    // Keep the trial's current plan unless the admin picks one.
    const tier = args.tier ?? (tenant.trial?.active ? tenant.trial.tier || 'standard' : TRIAL.tier);
    await ref.update({
      trial: { active: true, tier, startedAt: tenant.trial?.startedAt ?? now, endsAt },
      tier,
      entitlements: resolveEntitlements(tier, tenant.overrides),
      ...(tier === 'business' ? { 'trialsUsed.business': true } : {}),
    });
    await writeAudit({ actorUid: uid, actorRole: role, action: 'tenant.extend_trial', tenantId: ref.id, detail: { days, endsAt, tier } });
    return { ok: true, endsAt };
  },

  async endTrial(request, args) {
    const { uid, role } = await requirePlatformRole(request, ['super_admin']);
    const { ref } = await getTenant(args.tenantId);
    const changed = await expireTrial(ref.id, { force: true });
    await writeAudit({ actorUid: uid, actorRole: role, action: 'tenant.end_trial', tenantId: ref.id, detail: { changed } });
    return { ok: true, changed };
  },

  async getTenant(request, args) {
    await requirePlatformRole(request, ['super_admin', 'support', 'billing', 'read_only']);
    const { ref, tenant } = await getTenant(args.tenantId);
    const [members, usage] = await Promise.all([
      ref.collection('members').get(),
      ref.collection('usage').doc(monthKeySAST()).get(),
    ]);
    const owners = [];
    for (const m of members.docs) {
      if (m.data().role !== 'owner') continue;
      const u = await auth.getUser(m.id).catch(() => null);
      owners.push({ uid: m.id, email: u?.email ?? null });
    }
    const { billing = {}, ...rest } = tenant;
    return {
      tenant: {
        id: ref.id,
        ...rest,
        // never send the Paystack email token to a browser
        billing: {
          paystackCustomerCode: billing.paystackCustomerCode ?? null,
          paystackSubscriptionCode: billing.paystackSubscriptionCode ?? null,
          nextPaymentDate: billing.nextPaymentDate ?? null,
          cancelAtPeriodEnd: !!billing.cancelAtPeriodEnd,
        },
      },
      owners,
      memberCount: members.size,
      jobsThisMonth: usage.exists ? usage.data().jobs ?? 0 : 0,
      month: monthKeySAST(),
    };
  },

  async listAudit(request, args) {
    await requirePlatformRole(request, ['super_admin']);
    const limit = Math.min(Number(args.limit ?? 100) || 100, 300);
    const snap = await db.collection('auditLogs').orderBy('at', 'desc').limit(args.tenantId ? 500 : limit).get();
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (args.tenantId) rows = rows.filter((r) => r.tenantId === args.tenantId).slice(0, limit);
    return { entries: rows };
  },
};

export const POST = handle(async (request) => {
  const args = await readBody(request);
  const fn = Object.hasOwn(ACTIONS, args.action) ? ACTIONS[args.action] : null;
  if (!fn) throw new HttpError(400, 'Unknown action.');
  return fn(request, args);
});
