import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// FIREBASE_SERVICE_ACCOUNT: the service-account JSON (Firebase console > Project settings >
// Service accounts > Generate new private key), pasted as-is or base64-encoded.
function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  for (const parse of [() => JSON.parse(raw), () => JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))]) {
    try {
      const sa = parse();
      if (!sa?.private_key) continue;
      // Some dashboards store the key with literal "\n" text instead of line breaks.
      return { ...sa, private_key: sa.private_key.replace(/\\n/g, '\n') };
    } catch {
      /* try the next format */
    }
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid service-account JSON (or base64 of it)');
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount()) });
}

export const auth = getAuth();
export const db = getFirestore();

/** The Storage bucket for the document library, or null until FIREBASE_STORAGE_BUCKET is set in Vercel. */
export const bucket = () => (process.env.FIREBASE_STORAGE_BUCKET ? getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET) : null);
