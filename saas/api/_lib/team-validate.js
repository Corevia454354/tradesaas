import { ValidationError } from './validate.js';
import { ROLES, TASK_STATUSES, TASK_PRIORITIES, LEAVE_TYPES, isDateKey } from '../../public/shared/team.js';

// Pure input checks for /api/team. Unit-tested in test/team.test.mjs.
const bad = (m) => { throw new ValidationError(m); };
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const need = (v, label, max) => { const s = str(v, max + 1); if (!s) bad(`${label} is required.`); if (s.length > max) bad(`${label} is too long (${max} characters at most).`); return s; };
const id = (v, label) => { const s = str(v, 200); if (!s || s.includes('/')) bad(`${label} is missing.`); return s; };
const money = (v, label, { min = 0, max = 10_000_000 } = {}) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${label} must be a number.`);
  if (v < min || v > max) bad(`${label} must be between ${min} and ${max}.`);
  return Math.round(v * 100) / 100;
};
const idList = (v, label, max = 100) => {
  if (!Array.isArray(v)) bad(`${label} must be a list.`);
  if (v.length > max) bad(`${label} has too many people.`);
  return [...new Set(v.map((x) => id(x, label)))];
};
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function sanitizeInvite(i) {
  if (!isObj(i)) bad('Details are missing.');
  const email = str(i.email, 200).toLowerCase();
  if (!EMAIL.test(email)) bad('Enter a valid email address.');
  const role = i.role;
  if (!['dept_head', 'manager', 'employee'].includes(role)) bad('Choose a role.');
  return {
    email, role, name: need(i.name, 'Name', 80),
    managerId: i.managerId ? id(i.managerId, 'Manager') : null,
    department: str(i.department, 80),
    phone: str(i.phone, 40),
    hourlyRate: i.hourlyRate === undefined || i.hourlyRate === null || i.hourlyRate === '' ? 0 : money(i.hourlyRate, 'Hourly rate', { max: 100000 }),
  };
}

export function sanitizeMemberUpdate(i) {
  if (!isObj(i)) bad('Details are missing.');
  const out = { uid: id(i.uid, 'Person') };
  if (i.name !== undefined) out.name = need(i.name, 'Name', 80);
  if (i.role !== undefined) { if (!['dept_head', 'manager', 'employee'].includes(i.role)) bad('Choose a role.'); out.role = i.role; }
  if (i.managerId !== undefined) out.managerId = id(i.managerId, 'Manager');
  if (i.department !== undefined) out.department = str(i.department, 80);
  if (i.phone !== undefined) out.phone = str(i.phone, 40);
  if (i.hourlyRate !== undefined) out.hourlyRate = money(i.hourlyRate, 'Hourly rate', { max: 100000 });
  if (i.status !== undefined) { if (!['active', 'inactive'].includes(i.status)) bad('Unknown status.'); out.status = i.status; }
  return out;
}

export function sanitizeTask(i, { partial = false } = {}) {
  if (!isObj(i)) bad('Task details are missing.');
  const out = {};
  if (!partial || i.title !== undefined) out.title = need(i.title, 'Title', 200);
  if (!partial || i.description !== undefined) out.description = str(i.description, 2000);
  if (!partial || i.assigneeId !== undefined) out.assigneeId = id(i.assigneeId, 'Assignee');
  if (!partial || i.priority !== undefined) { const p = i.priority ?? 'normal'; if (!TASK_PRIORITIES.includes(p)) bad('Unknown priority.'); out.priority = p; }
  if (!partial || i.dueAt !== undefined) {
    if (i.dueAt === null || i.dueAt === undefined || i.dueAt === '') out.dueAt = null;
    else { if (typeof i.dueAt !== 'number' || !Number.isFinite(i.dueAt)) bad('Invalid due date.'); out.dueAt = i.dueAt; }
  }
  if (!partial || i.jobId !== undefined) out.jobId = i.jobId ? id(i.jobId, 'Job') : null;
  if (i.status !== undefined) { if (!TASK_STATUSES.includes(i.status)) bad('Unknown status.'); out.status = i.status; }
  return out;
}

export const sanitizeComment = (t) => need(t, 'Comment', 500);

export const DOC_KINDS = ['instruction', 'policy', 'safety', 'contract', 'notice', 'other'];
export function sanitizeDoc(i) {
  if (!isObj(i)) bad('Document details are missing.');
  const kind = i.kind ?? 'other';
  if (!DOC_KINDS.includes(kind)) bad('Unknown document type.');
  const link = i.link ? str(i.link, 500) : '';
  if (link && !/^https:\/\/\S+$/.test(link)) bad('The link must start with https://');
  const a = i.audience;
  let audience;
  if (a === 'all' || a === 'team') audience = a;
  else if (isObj(a) && Array.isArray(a.uids)) audience = { uids: idList(a.uids, 'People') };
  else bad('Choose who receives it.');
  const body = str(i.body, 10000);
  if (!body && !link) bad('Write the document or add a link.');
  return { title: need(i.title, 'Title', 200), kind, body, link, audience, requireAck: i.requireAck !== false };
}

const dateOr = (v, label) => { if (!isDateKey(v)) bad(`${label} must be a date.`); return v; };
export function sanitizeLeave(i) {
  if (!isObj(i)) bad('Leave details are missing.');
  if (!Object.hasOwn(LEAVE_TYPES, i.type)) bad('Choose a leave type.');
  return { type: i.type, from: dateOr(i.from, 'From'), to: dateOr(i.to, 'To'), note: str(i.note, 500) };
}

export const EXPENSE_CATEGORIES = ['materials', 'transport', 'subcontractor', 'tools', 'other'];
export function sanitizeExpense(i) {
  if (!isObj(i)) bad('Expense details are missing.');
  const category = i.category ?? 'materials';
  if (!EXPENSE_CATEGORIES.includes(category)) bad('Unknown expense type.');
  return {
    jobId: id(i.jobId, 'Job'), description: need(i.description, 'Description', 200), category,
    amount: money(i.amount, 'Amount', { min: 0.01, max: 10_000_000 }), date: dateOr(i.date, 'Date'),
  };
}

export function sanitizeManualTime(i) {
  if (!isObj(i)) bad('Time details are missing.');
  return {
    date: dateOr(i.date, 'Date'), jobId: i.jobId ? id(i.jobId, 'Job') : null, note: str(i.note, 300),
    hours: money(i.hours, 'Hours', { min: 0.25, max: 24 }),
  };
}

const lines = (v, label) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 30) bad(`${label} must be a list of up to 30 lines.`);
  return v.map((l) => {
    if (!isObj(l)) bad(`${label}: invalid line.`);
    return { desc: need(l.desc, `${label} description`, 100), amount: money(l.amount, `${label} amount`, { min: 0, max: 10_000_000 }) };
  });
};
export function sanitizePayslip(i) {
  if (!isObj(i)) bad('Payslip details are missing.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(i.period))) bad('Period must look like 2026-10.');
  const earnings = lines(i.earnings, 'Earnings');
  if (!earnings.length) bad('Add at least one earnings line.');
  return { employeeId: id(i.employeeId, 'Employee'), period: i.period, earnings, deductions: lines(i.deductions, 'Deductions'), notes: str(i.notes, 500) };
}

export function sanitizeChat(i) {
  if (!isObj(i)) bad('Chat details are missing.');
  const memberIds = idList(i.memberIds ?? [], 'People', 100);
  if (!memberIds.length) bad('Choose at least one person.');
  return { name: str(i.name, 80), memberIds };
}
export const sanitizeMessage = (t) => need(t, 'Message', 2000);

export const sanitizeRole = (r) => { if (!ROLES.includes(r)) bad('Unknown role.'); return r; };
