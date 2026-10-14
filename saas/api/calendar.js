import { HttpError, handle, readBody } from './_lib/http.js';
import { valid, loadMembers, ctx, getDoc } from './_lib/biz.js';
import * as V from './_lib/biz-validate.js';
import { canPost } from '../public/shared/calendar.js';

// POST /api/calendar { action, ... }   The team calendar (Business plan).
// Everyone in the business can READ every event (firestore.rules); only people the owner chose can add
// them, and a person can change or delete only their own (the owner can change any). Every write is made here.

const FEATURE = 'hierarchy';

async function posters(ref) {
  const s = (await ref.collection('settings').doc('calendar').get()).data();
  return s?.posters || { roles: [], uids: [] };
}
const mayEdit = (c, ev) => c.isOwner || ev.createdBy === c.uid;

const ACTIONS = {
  async create(request, args) {
    const c = await ctx(request, FEATURE);
    if (!canPost({ ...c.me, uid: c.uid }, await posters(c.ref))) throw new HttpError(403, 'You have not been given permission to add calendar events. Ask the owner.');
    const d = valid(V.sanitizeEvent, args.data);
    const now = Date.now();
    const ref = await c.ref.collection('events').add({ ...d, createdBy: c.uid, createdByName: c.me.name, createdAt: now, updatedAt: now });
    return { id: ref.id };
  },

  async update(request, args) {
    const c = await ctx(request, FEATURE);
    const ev = await getDoc(c.ref, 'events', args.id, 'Event');
    if (!mayEdit(c, ev)) throw new HttpError(403, 'Only the owner or the person who added the event can change it.');
    const d = valid(V.sanitizeEvent, args.data);
    await ev.ref.update({ ...d, updatedAt: Date.now() });
    return { ok: true };
  },

  async delete(request, args) {
    const c = await ctx(request, FEATURE);
    const ev = await getDoc(c.ref, 'events', args.id, 'Event');
    if (!mayEdit(c, ev)) throw new HttpError(403, 'Only the owner or the person who added the event can delete it.');
    await ev.ref.delete();
    return { ok: true };
  },

  async setPosters(request, args) {
    const c = await ctx(request, FEATURE);
    if (!c.isOwner) throw new HttpError(403, 'Only the business owner can do this.');
    const p = valid(V.sanitizePosters, args.data);
    const members = await loadMembers(c.ref);
    p.uids = p.uids.filter((x) => members.get(x) && members.get(x).status !== 'inactive' && members.get(x).role !== 'owner');
    await c.ref.collection('settings').doc('calendar').set({ posters: p, updatedAt: Date.now() }, { merge: true });
    return { ok: true, posters: p };
  },
};

export const POST = handle(async (request) => {
  const args = await readBody(request);
  const fn = Object.hasOwn(ACTIONS, args.action) ? ACTIONS[args.action] : null;
  if (!fn) throw new HttpError(400, 'Unknown action.');
  return fn(request, args);
});
