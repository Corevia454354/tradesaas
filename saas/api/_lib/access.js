import { db } from './firebase.js';
import { docVisibleTo } from '../../public/shared/library.js';

// "Who may open this?" lists are stored on each record (visibleTo) so the browser can read with a simple
// array-contains query. They depend on roles and people, so they are recomputed whenever the team changes.

export async function supportAgents(ref) {
  const s = await ref.collection('settings').doc('support').get();
  return Array.isArray(s.data()?.agents) ? s.data().agents : [];
}

export function ticketVisibleTo(members, agents) {
  const out = new Set();
  for (const m of members.values()) {
    if (m.status === 'inactive') continue;
    if (m.role === 'owner' || agents.includes(m.uid)) out.add(m.uid);
  }
  return [...out];
}

/** Rewrite visibleTo on every library document and support ticket of one business. */
export async function refreshAccess(ref) {
  const snap = await ref.collection('members').get();
  const members = new Map(snap.docs.map((d) => [d.id, { uid: d.id, ...d.data() }]));
  const agents = (await supportAgents(ref)).filter((u) => members.get(u)?.status !== 'inactive' && members.has(u));
  const ops = [];
  for (const d of (await ref.collection('library').get()).docs) {
    const v = docVisibleTo(members, d.data());
    if (JSON.stringify(v) !== JSON.stringify(d.data().visibleTo)) ops.push((b) => b.update(d.ref, { visibleTo: v }));
  }
  for (const d of (await ref.collection('tickets').get()).docs) {
    const v = ticketVisibleTo(members, agents);
    const cur = d.data();
    const keep = cur.assigneeId && !agents.includes(cur.assigneeId) ? { assigneeId: null, assigneeName: null } : {};
    ops.push((b) => b.update(d.ref, { visibleTo: v, ...keep }));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch(); ops.slice(i, i + 400).forEach((f) => f(batch)); await batch.commit();
  }
}
