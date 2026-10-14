import { db } from './_lib/firebase.js';
import { expireTrial } from './_lib/trial.js';

// GET /api/cron-trials: run once a day by Vercel Cron (see vercel.json). Ends trials that are due.
// Set CRON_SECRET in Vercel (any long random text); Vercel then sends it as "Authorization: Bearer ...".
// Trials are also ended on demand (when the business opens the app or creates a job), so this is a tidy-up.

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const now = Date.now();
  const snap = await db.collection('tenants').where('trial.active', '==', true).get();
  let ended = 0;
  for (const d of snap.docs) {
    if (d.data().trial.endsAt <= now && (await expireTrial(d.id, { now }))) ended++;
  }
  return Response.json({ checked: snap.size, ended });
}
