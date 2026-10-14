// GET /api/health: are the server-side settings in place? Returns true/false per setting and
// never any secret values. Open https://<your-domain>/api/health after deploying: all should be true.

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  for (const parse of [() => JSON.parse(raw), () => JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))]) {
    try {
      const sa = parse();
      if (sa?.private_key && sa?.client_email) return sa;
    } catch {
      /* try the next format */
    }
  }
  return null;
}

export function GET() {
  const sa = serviceAccount();
  const key = process.env.PAYSTACK_SECRET_KEY || '';
  const checks = {
    firebaseServiceAccount: !!sa,
    firebaseProjectId: sa?.project_id ?? null,
    paystackSecretKey: key.startsWith('sk_'),
    paystackMode: key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : null,
    paystackPlanStandard: !!process.env.PAYSTACK_PLAN_STANDARD,
    paystackPlanBusiness: !!process.env.PAYSTACK_PLAN_BUSINESS,
    appUrl: process.env.APP_URL || null,
    storageBucketSet: !!process.env.FIREBASE_STORAGE_BUCKET,
    cronSecretSet: !!process.env.CRON_SECRET,
    adminEmailsSet: !!String(process.env.PLATFORM_ADMIN_EMAILS || '').trim(),
  };
  const ok = checks.firebaseServiceAccount && checks.paystackSecretKey && checks.paystackPlanStandard && !!checks.appUrl;
  return Response.json({ ok, checks }, { headers: { 'Cache-Control': 'no-store' } });
}
