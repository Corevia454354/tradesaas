// One-time bootstrap: give yourself the super_admin platform role.
//
//   export FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
//   npm run make-admin -- you@example.com
//
// The account must already exist in Firebase Auth (sign up once in the app).
// Sign out and in again afterwards so the new claim reaches your token.

import { auth } from '../api/_lib/firebase.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), platformRole: 'super_admin' });
console.log(`${email} (${user.uid}) is now super_admin.`);
