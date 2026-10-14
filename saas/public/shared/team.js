// Pure helpers for the Business tier (hierarchy, leave, time, payslips, job costing).
// Used by the browser app AND the API, so both always agree. No Firebase, no DOM.
import { round2 } from '../lib.js';

export const ROLES = ['owner', 'dept_head', 'manager', 'employee'];
export const ROLE_LABEL = { owner: 'Owner', dept_head: 'Department head', manager: 'Manager', employee: 'Employee' };
export const rank = (role) => ROLES.indexOf(role);
export const isManagerRole = (role) => role === 'owner' || role === 'dept_head' || role === 'manager';
/** A person can sit under another only if their role is lower than the boss's role. */
export const canReportTo = (childRole, parentRole) => rank(parentRole) >= 0 && rank(childRole) > rank(parentRole);

/** Everyone below `uid` in the hierarchy. */
export const descendants = (members, uid) => members.filter((m) => (m.ancestors || []).includes(uid));

/** The ancestors list for someone who reports to `parent`. */
export const ancestorsFor = (parent) => [...(parent.ancestors || []), parent.uid];

/** Who may see a record: each person named, plus everyone above them (the owner is always above). */
export function visibleFor(memberMap, ...uids) {
  const out = new Set();
  for (const uid of uids.filter(Boolean)) {
    const m = memberMap.get ? memberMap.get(uid) : memberMap[uid];
    out.add(uid);
    for (const a of m?.ancestors || []) out.add(a);
  }
  return [...out];
}

// ---- tasks
export const TASK_STATUSES = ['todo', 'in_progress', 'done'];
export const TASK_PRIORITIES = ['low', 'normal', 'high'];
export const taskIsOverdue = (t, now = Date.now()) => t.status !== 'done' && !!t.dueAt && t.dueAt < now;

// ---- leave
export const LEAVE_TYPES = { annual: 'Annual leave', sick: 'Sick leave', family: 'Family responsibility', unpaid: 'Unpaid leave' };
export const DEFAULT_ALLOWANCE = { annual: 15, sick: 10, family: 3 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toUtc = (s) => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t : null;
};
export const isDateKey = (s) => toUtc(s) !== null;

/** Working days (Mon to Fri) from `from` to `to`, both included. Public holidays are not excluded. */
export function workingDays(from, to) {
  const a = toUtc(from), b = toUtc(to);
  if (a === null || b === null || b < a) return 0;
  let n = 0;
  for (let t = a; t <= b; t += 864e5) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}
export const dateKeyDiffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 864e5);

/** Days of one leave type used in a calendar year by one person. Pending requests count so they cannot over-book. */
export function leaveUsed(requests, uid, year, type, statuses = ['approved', 'pending']) {
  return requests
    .filter((r) => r.uid === uid && r.type === type && statuses.includes(r.status) && String(r.from).startsWith(String(year)))
    .reduce((n, r) => n + (r.days || 0), 0);
}
export function leaveBalance(requests, uid, year, allowance = DEFAULT_ALLOWANCE) {
  const out = {};
  for (const type of ['annual', 'sick', 'family']) {
    const allowed = allowance[type] ?? DEFAULT_ALLOWANCE[type];
    const used = leaveUsed(requests, uid, year, type);
    out[type] = { allowed, used, left: Math.max(0, allowed - used) };
  }
  out.unpaid = { used: leaveUsed(requests, uid, year, 'unpaid') };
  return out;
}

// ---- time
export const hoursFromMs = (ms) => round2(Math.max(0, ms) / 36e5);
export const MAX_TIMER_HOURS = 16;

// ---- payslips (record keeping only; the platform does not calculate tax or move money)
export function payslipTotals(earnings = [], deductions = []) {
  const cents = (list) => list.reduce((n, l) => n + Math.round((Number(l.amount) || 0) * 100), 0);
  const gross = cents(earnings), ded = cents(deductions);
  return { gross: gross / 100, deductionsTotal: ded / 100, net: (gross - ded) / 100 };
}

// ---- job costing
export function jobCosting({ job, invoices = [], expenses = [], labour = [] }) {
  const mine = invoices.filter((i) => i.jobId === job.id && i.status !== 'draft');
  const revenue = round2(mine.reduce((n, i) => n + (i.total || 0), 0));
  const paid = round2(mine.filter((i) => i.status === 'paid').reduce((n, i) => n + (i.total || 0), 0));
  const materials = round2(expenses.filter((e) => e.jobId === job.id).reduce((n, e) => n + (e.amount || 0), 0));
  const labourCost = round2(labour.filter((l) => l.jobId === job.id).reduce((n, l) => n + (l.cost || 0), 0));
  const hours = round2(labour.filter((l) => l.jobId === job.id).reduce((n, l) => n + (l.hours || 0), 0));
  const cost = round2(materials + labourCost);
  const profit = round2(revenue - cost);
  return { revenue, paid, materials, labour: labourCost, hours, cost, profit, marginPct: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null };
}
