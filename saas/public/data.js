import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  sendEmailVerification,
  connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  getDocs,
  connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';
import { monthKeySAST, dateKeySAST } from './lib.js';

// Firebase is used for Auth, Firestore and Storage only. Server-side work
// (signup, billing, admin, and creating jobs) lives in the Vercel API routes under /api.

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

// Open the app with ?emulator on localhost to use the Firebase Auth/Firestore emulators.
if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator')) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// ---- auth ----
export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signIn = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const signUp = (email, pw) => createUserWithEmailAndPassword(auth, email, pw);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);
export const sendVerification = () => sendEmailVerification(auth.currentUser);
export const reloadUser = async () => { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); return auth.currentUser; };
export const refreshToken = () => auth.currentUser.getIdToken(true);

// ---- Vercel API ----
/** POST JSON to one of our /api routes with the user's Firebase ID token. */
export async function api(path, body = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ---- Firestore ----
export const KEYS = ['clients', 'quotes', 'jobs', 'certificates', 'invoices'];
const col = (tid, key) => collection(db, 'tenants', tid, key);

/**
 * Live-subscribe to the business, its profile and every collection. Returns an unsubscribe fn.
 * opts: { uid, role }. Staff below manager level cannot read quotes or invoices, so those are skipped for them.
 * Business-tier collections start as soon as the plan includes the team feature. They are filtered by
 * `visibleTo` (the server decides who may see each record), so a person only ever receives their own slice.
 */
export function listen(tid, onPatch, opts = {}) {
  const unsubs = [];
  const fail = (err) => onPatch({ error: err });
  const { uid, role } = opts;
  const isEmployee = role === 'employee';
  let teamStarted = false;

  const startTeam = () => {
    teamStarted = true;
    const mine = (c) => query(col(tid, c), where('visibleTo', 'array-contains', uid));
    for (const c of ['tasks', 'workDocs', 'timeEntries', 'leave', 'expenses', 'payslips', 'library', 'tickets']) {
      unsubs.push(onSnapshot(mine(c), (s) => onPatch({ [c]: s.docs.map((d) => ({ id: d.id, ...d.data() })) }), fail));
    }
    unsubs.push(onSnapshot(col(tid, 'members'), (s) => onPatch({ members: s.docs.map((d) => ({ uid: d.id, ...d.data() })) }), fail));
    unsubs.push(onSnapshot(query(col(tid, 'chats'), where('members', 'array-contains', uid)), (s) => onPatch({ chats: s.docs.map((d) => ({ id: d.id, ...d.data() })) }), fail));
    unsubs.push(onSnapshot(doc(db, 'tenants', tid, 'settings', 'library'), (s) => onPatch({ libSettings: s.data() || {} }), fail));
    unsubs.push(onSnapshot(doc(db, 'tenants', tid, 'settings', 'support'), (s) => onPatch({ supportSettings: s.data() || {} }), fail));
    unsubs.push(onSnapshot(doc(db, 'tenants', tid, 'settings', 'team'), (s) => onPatch({ teamSettings: s.data() || {} }), fail));
    // Team calendar: everyone reads every event. Only the last 90 days onwards are loaded.
    const since = dateKeySAST(Date.now() - 90 * 864e5);
    unsubs.push(onSnapshot(query(col(tid, 'events'), where('endDate', '>=', since)), (s) => onPatch({ events: s.docs.map((d) => ({ id: d.id, ...d.data() })) }), fail));
    unsubs.push(onSnapshot(doc(db, 'tenants', tid, 'settings', 'calendar'), (s) => onPatch({ calSettings: s.data() || {} }), fail));
    if (role === 'owner') {
      unsubs.push(onSnapshot(col(tid, 'labourCosts'), (s) => onPatch({ labour: s.docs.map((d) => ({ id: d.id, ...d.data() })) }), fail));
      unsubs.push(onSnapshot(col(tid, 'private'), (s) => onPatch({ rates: Object.fromEntries(s.docs.map((d) => [d.id, d.data().hourlyRate ?? 0])) }), fail));
    }
  };

  unsubs.push(onSnapshot(doc(db, 'tenants', tid), (s) => {
    const t = s.data();
    onPatch({ tenant: t });
    if (!teamStarted && t?.entitlements?.features?.includes('hierarchy') && uid) startTeam();
  }, fail));
  // Your own member record (profile picture, name), on every plan.
  if (uid) unsubs.push(onSnapshot(doc(db, 'tenants', tid, 'members', uid), (s) => onPatch({ myMember: s.exists() ? { uid, ...s.data() } : null }), fail));
  unsubs.push(
    onSnapshot(doc(db, 'tenants', tid, 'settings', 'profile'), (s) => onPatch({ profile: s.data() || {} }), fail),
  );
  // Jobs created this month, counted by the server (see api/jobs.js).
  unsubs.push(onSnapshot(doc(db, 'tenants', tid, 'usage', monthKeySAST()), (s) => onPatch({ usage: s.data() || {} }), fail));
  for (const key of KEYS) {
    if (isEmployee && (key === 'quotes' || key === 'invoices')) continue;
    unsubs.push(
      onSnapshot(
        query(col(tid, key), orderBy('createdAt', 'desc')),
        (s) => onPatch({ [key]: s.docs.map((d) => ({ id: d.id, ...d.data() })) }),
        fail,
      ),
    );
  }
  return () => unsubs.forEach((u) => u());
}

/** Newest 150 messages of one chat, oldest first. */
export function listenMessages(tid, chatId, cb) {
  const q = query(collection(db, 'tenants', tid, 'chats', chatId, 'messages'), orderBy('at', 'desc'), limit(150));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()), (e) => console.error(e));
}

export async function create(tid, key, data) {
  // Jobs are created by the server so the plan's monthly limit cannot be bypassed from the browser.
  if (key === 'jobs') return (await api('/api/jobs', { data })).id;
  const now = Date.now();
  const ref = await addDoc(col(tid, key), { ...data, createdAt: now, updatedAt: now });
  return ref.id;
}

export const save = (tid, key, id, data) =>
  updateDoc(doc(db, 'tenants', tid, key, id), { ...data, updatedAt: Date.now() });

export const remove = (tid, key, id) => deleteDoc(doc(db, 'tenants', tid, key, id));

export const saveTeamSettings = (tid, data) =>
  setDoc(doc(db, 'tenants', tid, 'settings', 'team'), { ...data, updatedAt: Date.now() }, { merge: true });

export const saveProfile = (tid, data) =>
  setDoc(doc(db, 'tenants', tid, 'settings', 'profile'), { ...data, updatedAt: Date.now() }, { merge: true });

/** Upload one library file straight to Storage. The server approved this exact path (api/library prepare). */
export async function uploadLibraryFile(path, file) {
  await uploadBytes(storageRef(getStorage(app), path), file, { contentType: file.type || 'application/octet-stream' });
}
