import { bucket } from './_lib/firebase.js';
import { HttpError, handle, readBody } from './_lib/http.js';
import { valid, loadMembers, ctx, getDoc } from './_lib/biz.js';
import * as V from './_lib/biz-validate.js';
import { canUpload, docVisibleTo, MAX_FILE_MB } from '../public/shared/library.js';

// POST /api/library { action, ... }   The business document library (Business plan).
// Files go browser -> Firebase Storage directly (storage.rules only lets the person who was approved here
// upload to the exact path), and every download goes through "url", which checks who may see the file.
// The browser only READS the list of documents (firestore.rules); every change is made here.

const FEATURE = 'docLibrary';
const MB = 1024 * 1024;

async function uploaders(ref) {
  const s = (await ref.collection('settings').doc('library').get()).data();
  return s?.uploaders || { roles: [], uids: [] };
}
function needStorage() {
  const b = bucket();
  if (!b) throw new HttpError(503, 'File storage is not switched on yet. The owner needs to finish the Storage setup (see the setup guide). You can still add a web link.');
  return b;
}
const mayEdit = (c, doc) => c.isOwner || doc.uploaderId === c.uid;
async function checkAudience(c, members, access) {
  for (const u of access.uids) { const m = members.get(u); if (!m || m.status === 'inactive') throw new HttpError(400, 'One of the people you chose was not found.'); }
}
async function usedBytes(ref) {
  const snap = await ref.collection('library').where('status', '==', 'ready').get();
  return snap.docs.reduce((n, d) => n + (d.data().size || 0), 0);
}

const ACTIONS = {
  async prepare(request, args) {
    const c = await ctx(request, FEATURE);
    const members = await loadMembers(c.ref);
    if (!canUpload({ ...c.me, uid: c.uid }, await uploaders(c.ref))) throw new HttpError(403, 'You have not been given permission to add documents. Ask the owner.');
    const d = valid(V.sanitizeUpload, args.data);
    needStorage();
    await checkAudience(c, members, d.access);
    const limitMb = c.tenant.entitlements.limits.storageMb;
    if (limitMb !== -1 && (await usedBytes(c.ref)) + d.size > limitMb * MB) throw new HttpError(403, 'Your storage is full. Delete old files or contact us for more space.');
    const ref = c.ref.collection('library').doc();
    const now = Date.now();
    const doc = { title: d.title, category: d.category, note: d.note, expiresOn: d.expiresOn, access: d.access, kind: 'file', status: 'uploading', fileName: d.fileName, storageName: d.fileName, size: d.size, uploaderId: c.uid, uploaderName: c.me.name, createdAt: now, updatedAt: now };
    doc.visibleTo = [c.uid];
    await ref.set(doc);
    return { id: ref.id, path: `tenants/${c.tenantId}/library/${ref.id}/${d.fileName}` };
  },

  async finalize(request, args) {
    const c = await ctx(request, FEATURE);
    const doc = await getDoc(c.ref, 'library', args.id, 'Document');
    if (doc.uploaderId !== c.uid || doc.status !== 'uploading') throw new HttpError(400, 'Nothing to finish.');
    const file = needStorage().file(`tenants/${c.tenantId}/library/${doc.id}/${doc.storageName}`);
    const meta = await file.getMetadata().then((r) => r[0]).catch(() => null);
    if (!meta) throw new HttpError(400, 'The file did not arrive. Please try again.');
    if (Number(meta.size) > MAX_FILE_MB * MB) { await file.delete().catch(() => {}); await doc.ref.delete(); throw new HttpError(400, `Files can be up to ${MAX_FILE_MB} MB.`); }
    const members = await loadMembers(c.ref);
    await doc.ref.update({ status: 'ready', size: Number(meta.size), visibleTo: docVisibleTo(members, doc), updatedAt: Date.now() });
    return { ok: true };
  },

  async addLink(request, args) {
    const c = await ctx(request, FEATURE);
    const members = await loadMembers(c.ref);
    if (!canUpload({ ...c.me, uid: c.uid }, await uploaders(c.ref))) throw new HttpError(403, 'You have not been given permission to add documents. Ask the owner.');
    const d = valid(V.sanitizeLink, args.data);
    await checkAudience(c, members, d.access);
    const now = Date.now();
    const doc = { ...d, kind: 'link', status: 'ready', size: 0, uploaderId: c.uid, uploaderName: c.me.name, createdAt: now, updatedAt: now };
    doc.visibleTo = docVisibleTo(members, doc);
    const ref = await c.ref.collection('library').add(doc);
    return { id: ref.id };
  },

  async update(request, args) {
    const c = await ctx(request, FEATURE);
    const doc = await getDoc(c.ref, 'library', args.id, 'Document');
    if (!mayEdit(c, doc)) throw new HttpError(403, 'Only the owner or the person who added it can change it.');
    const d = valid(V.sanitizeLibUpdate, args.data);
    const members = await loadMembers(c.ref);
    if (d.access) await checkAudience(c, members, d.access);
    const next = { ...doc, ...d };
    const upd = { ...d, updatedAt: Date.now() };
    if (doc.status === 'ready') upd.visibleTo = docVisibleTo(members, next);
    await doc.ref.update(upd);
    return { ok: true };
  },

  /** A short-lived download link, only for people on the document's list. */
  async url(request, args) {
    const c = await ctx(request, FEATURE);
    const doc = await getDoc(c.ref, 'library', args.id, 'Document');
    if (doc.status !== 'ready' || !(doc.visibleTo || []).includes(c.uid)) throw new HttpError(403, 'You do not have access to this document.');
    if (doc.kind === 'link') return { url: doc.link };
    const [url] = await needStorage().file(`tenants/${c.tenantId}/library/${doc.id}/${doc.storageName}`)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 5 * 60 * 1000, responseDisposition: `attachment; filename="${doc.fileName}"` });
    return { url };
  },

  async delete(request, args) {
    const c = await ctx(request, FEATURE);
    const doc = await getDoc(c.ref, 'library', args.id, 'Document');
    if (!mayEdit(c, doc)) throw new HttpError(403, 'Only the owner or the person who added it can delete it.');
    if (doc.kind === 'file') { const b = bucket(); if (b) await b.file(`tenants/${c.tenantId}/library/${doc.id}/${doc.storageName}`).delete().catch(() => {}); }
    await doc.ref.delete();
    return { ok: true };
  },

  async setUploaders(request, args) {
    const c = await ctx(request, FEATURE);
    if (!c.isOwner) throw new HttpError(403, 'Only the business owner can do this.');
    const u = valid(V.sanitizeUploaders, args.data);
    const members = await loadMembers(c.ref);
    u.uids = u.uids.filter((x) => members.get(x) && members.get(x).status !== 'inactive' && members.get(x).role !== 'owner');
    await c.ref.collection('settings').doc('library').set({ uploaders: u, updatedAt: Date.now() }, { merge: true });
    return { ok: true, uploaders: u };
  },
};

export const POST = handle(async (request) => {
  const args = await readBody(request);
  const fn = Object.hasOwn(ACTIONS, args.action) ? ACTIONS[args.action] : null;
  if (!fn) throw new HttpError(400, 'Unknown action.');
  return fn(request, args);
});
