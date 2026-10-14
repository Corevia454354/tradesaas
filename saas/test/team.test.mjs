import assert from 'node:assert/strict';
import * as T from '../public/shared/team.js';
import * as V from '../api/_lib/team-validate.js';
import { ValidationError } from '../api/_lib/validate.js';
import { dateKeySAST } from '../public/lib.js';

const throwsV = (fn) => assert.throws(fn, (e) => e instanceof ValidationError);

// ---- hierarchy
assert.ok(T.canReportTo('manager', 'owner') && T.canReportTo('employee', 'manager') && T.canReportTo('manager', 'dept_head'));
assert.ok(!T.canReportTo('manager', 'manager') && !T.canReportTo('dept_head', 'manager') && !T.canReportTo('owner', 'manager') && !T.canReportTo('employee', 'nobody'));
assert.ok(T.isManagerRole('owner') && T.isManagerRole('manager') && !T.isManagerRole('employee'));
const members = new Map([
  ['o', { uid: 'o', ancestors: [] }], ['d', { uid: 'd', ancestors: ['o'] }], ['m', { uid: 'm', ancestors: ['o', 'd'] }], ['e', { uid: 'e', ancestors: ['o', 'd', 'm'] }], ['f', { uid: 'f', ancestors: ['o'] }],
]);
assert.deepEqual(T.visibleFor(members, 'e').sort(), ['d', 'e', 'm', 'o']);
assert.deepEqual(T.visibleFor(members, 'e', 'f').sort(), ['d', 'e', 'f', 'm', 'o']);
assert.deepEqual(T.visibleFor(members, 'o'), ['o']);
assert.deepEqual(T.descendants([...members.values()], 'd').map((m) => m.uid).sort(), ['e', 'm']);
assert.deepEqual(T.ancestorsFor({ uid: 'm', ancestors: ['o', 'd'] }), ['o', 'd', 'm']);

// ---- leave days
assert.equal(T.workingDays('2026-10-05', '2026-10-09'), 5); // Mon-Fri
assert.equal(T.workingDays('2026-10-05', '2026-10-11'), 5); // through the weekend
assert.equal(T.workingDays('2026-10-10', '2026-10-11'), 0); // Sat-Sun
assert.equal(T.workingDays('2026-10-09', '2026-10-12'), 2); // Fri + Mon
assert.equal(T.workingDays('2026-10-05', '2026-10-05'), 1);
assert.equal(T.workingDays('2026-10-09', '2026-10-05'), 0);
assert.equal(T.workingDays('2026-02-30', '2026-03-02'), 0);
assert.equal(T.workingDays('nope', '2026-03-02'), 0);
assert.equal(T.dateKeyDiffDays('2026-10-01', '2026-10-31'), 30);
const reqs = [
  { uid: 'e', type: 'annual', status: 'approved', from: '2026-03-02', days: 5 },
  { uid: 'e', type: 'annual', status: 'pending', from: '2026-06-01', days: 3 },
  { uid: 'e', type: 'annual', status: 'declined', from: '2026-07-01', days: 9 },
  { uid: 'e', type: 'annual', status: 'cancelled', from: '2026-07-01', days: 9 },
  { uid: 'e', type: 'annual', status: 'approved', from: '2025-12-15', days: 4 }, // last year
  { uid: 'x', type: 'annual', status: 'approved', from: '2026-03-02', days: 7 }, // someone else
  { uid: 'e', type: 'sick', status: 'approved', from: '2026-04-01', days: 2 },
];
const bal = T.leaveBalance(reqs, 'e', 2026);
assert.deepEqual(bal.annual, { allowed: 15, used: 8, left: 7 });
assert.deepEqual(bal.sick, { allowed: 10, used: 2, left: 8 });
assert.equal(T.leaveBalance(reqs, 'e', 2026, { annual: 6 }).annual.left, 0); // never negative

// ---- time, payslips
assert.equal(T.hoursFromMs(90 * 60e3), 1.5);
assert.equal(T.hoursFromMs(-5), 0);
assert.deepEqual(T.payslipTotals([{ amount: 10000.1 }, { amount: 0.2 }], [{ amount: 1500.05 }]), { gross: 10000.3, deductionsTotal: 1500.05, net: 8500.25 });
assert.deepEqual(T.payslipTotals([], []), { gross: 0, deductionsTotal: 0, net: 0 });

// ---- job costing
const c = T.jobCosting({
  job: { id: 'j1' },
  invoices: [{ jobId: 'j1', status: 'paid', total: 1000 }, { jobId: 'j1', status: 'sent', total: 500 }, { jobId: 'j1', status: 'draft', total: 9999 }, { jobId: 'j2', status: 'paid', total: 77 }],
  expenses: [{ jobId: 'j1', amount: 200.5 }, { jobId: 'j2', amount: 99 }],
  labour: [{ jobId: 'j1', cost: 300, hours: 4 }, { jobId: 'j1', cost: 150.25, hours: 2 }, { jobId: null, cost: 50, hours: 1 }],
});
assert.deepEqual(c, { revenue: 1500, paid: 1000, materials: 200.5, labour: 450.25, hours: 6, cost: 650.75, profit: 849.25, marginPct: 56.6 });
assert.equal(T.jobCosting({ job: { id: 'z' } }).marginPct, null);
assert.ok(T.taskIsOverdue({ status: 'todo', dueAt: 1 }, 5) && !T.taskIsOverdue({ status: 'done', dueAt: 1 }, 5) && !T.taskIsOverdue({ status: 'todo' }, 5));

// SAST date key
assert.equal(dateKeySAST(Date.UTC(2026, 9, 31, 21, 59)), '2026-10-31');
assert.equal(dateKeySAST(Date.UTC(2026, 9, 31, 22, 0)), '2026-11-01');

// ---- validators
const inv = { email: ' Bob@Site.CO.za ', name: ' Bob ', role: 'employee', hourlyRate: 120 };
assert.deepEqual(V.sanitizeInvite(inv), { email: 'bob@site.co.za', role: 'employee', name: 'Bob', managerId: null, department: '', phone: '', hourlyRate: 120 });
throwsV(() => V.sanitizeInvite({ ...inv, email: 'nope' }));
throwsV(() => V.sanitizeInvite({ ...inv, role: 'owner' }));
throwsV(() => V.sanitizeInvite({ ...inv, name: '' }));
throwsV(() => V.sanitizeInvite({ ...inv, hourlyRate: -1 }));
throwsV(() => V.sanitizeInvite({ ...inv, hourlyRate: '100' }));
throwsV(() => V.sanitizeInvite(null));
assert.deepEqual(V.sanitizeMemberUpdate({ uid: 'u', role: 'manager', evil: 1 }), { uid: 'u', role: 'manager' });
throwsV(() => V.sanitizeMemberUpdate({ uid: 'a/b' }));
throwsV(() => V.sanitizeMemberUpdate({ uid: 'u', status: 'gone' }));
throwsV(() => V.sanitizeMemberUpdate({ uid: 'u', role: 'owner' }));

assert.deepEqual(V.sanitizeTask({ title: ' Fix DB ', assigneeId: 'u1' }), { title: 'Fix DB', description: '', assigneeId: 'u1', priority: 'normal', dueAt: null, jobId: null });
assert.deepEqual(V.sanitizeTask({ status: 'done' }, { partial: true }), { status: 'done' });
assert.deepEqual(V.sanitizeTask({ title: 'x', assigneeId: 'u', createdBy: 'hacker', visibleTo: ['x'], status: 'todo' }), { title: 'x', description: '', assigneeId: 'u', priority: 'normal', dueAt: null, jobId: null, status: 'todo' });
throwsV(() => V.sanitizeTask({ title: '', assigneeId: 'u' }));
throwsV(() => V.sanitizeTask({ title: 'x' }));
throwsV(() => V.sanitizeTask({ title: 'x', assigneeId: 'u', priority: 'urgent' }));
throwsV(() => V.sanitizeTask({ title: 'x', assigneeId: 'u', dueAt: '2026-10-10' }));
throwsV(() => V.sanitizeTask({ status: 'finished' }, { partial: true }));

assert.equal(V.sanitizeDoc({ title: 'Safety', body: 'Wear boots', audience: 'team' }).requireAck, true);
assert.deepEqual(V.sanitizeDoc({ title: 'T', link: 'https://x.co/a.pdf', audience: { uids: ['a', 'a', 'b'] }, requireAck: false }).audience, { uids: ['a', 'b'] });
throwsV(() => V.sanitizeDoc({ title: 'T', body: 'x' }));
throwsV(() => V.sanitizeDoc({ title: 'T', body: 'x', audience: 'everyone' }));
throwsV(() => V.sanitizeDoc({ title: 'T', link: 'http://x.co', audience: 'all' }));
throwsV(() => V.sanitizeDoc({ title: 'T', link: 'javascript:1', audience: 'all' }));
throwsV(() => V.sanitizeDoc({ title: 'T', audience: 'all' }));
throwsV(() => V.sanitizeDoc({ title: 'T', body: 'x', kind: 'weird', audience: 'all' }));

assert.deepEqual(V.sanitizeLeave({ type: 'annual', from: '2026-10-05', to: '2026-10-09', note: 'rest' }), { type: 'annual', from: '2026-10-05', to: '2026-10-09', note: 'rest' });
throwsV(() => V.sanitizeLeave({ type: 'holiday', from: '2026-10-05', to: '2026-10-09' }));
throwsV(() => V.sanitizeLeave({ type: 'annual', from: '2026-13-05', to: '2026-10-09' }));
throwsV(() => V.sanitizeLeave({ type: 'annual', from: '05/10/2026', to: '2026-10-09' }));

assert.equal(V.sanitizeExpense({ jobId: 'j', description: 'Cable', amount: 99.999, date: '2026-10-01' }).amount, 100);
throwsV(() => V.sanitizeExpense({ jobId: 'j', description: 'x', amount: 0, date: '2026-10-01' }));
throwsV(() => V.sanitizeExpense({ jobId: 'j', description: 'x', amount: '5', date: '2026-10-01' }));
throwsV(() => V.sanitizeExpense({ jobId: 'j', description: 'x', amount: 5, date: 'yesterday' }));
throwsV(() => V.sanitizeExpense({ jobId: 'j', description: 'x', amount: 5, date: '2026-10-01', category: 'yacht' }));

assert.equal(V.sanitizeManualTime({ date: '2026-10-01', hours: 7.5 }).hours, 7.5);
throwsV(() => V.sanitizeManualTime({ date: '2026-10-01', hours: 0 }));
throwsV(() => V.sanitizeManualTime({ date: '2026-10-01', hours: 25 }));

const ps = V.sanitizePayslip({ employeeId: 'e', period: '2026-10', earnings: [{ desc: 'Salary', amount: 15000 }], deductions: [{ desc: 'PAYE', amount: 1800 }] });
assert.equal(ps.earnings[0].amount, 15000);
throwsV(() => V.sanitizePayslip({ employeeId: 'e', period: '2026-13', earnings: [{ desc: 'S', amount: 1 }] }));
throwsV(() => V.sanitizePayslip({ employeeId: 'e', period: '2026-10', earnings: [] }));
throwsV(() => V.sanitizePayslip({ employeeId: 'e', period: '2026-10', earnings: [{ desc: 'S', amount: -1 }] }));
throwsV(() => V.sanitizePayslip({ employeeId: 'e', period: '2026-10', earnings: [{ desc: '', amount: 1 }] }));

assert.deepEqual(V.sanitizeChat({ name: ' Crew ', memberIds: ['a', 'a'] }), { name: 'Crew', memberIds: ['a'] });
throwsV(() => V.sanitizeChat({ name: 'x', memberIds: [] }));
throwsV(() => V.sanitizeChat({ name: 'x', memberIds: 'a' }));
throwsV(() => V.sanitizeMessage('   '));
assert.equal(V.sanitizeMessage(' hi '), 'hi');
throwsV(() => V.sanitizeMessage('x'.repeat(2001)));

console.log('team tests passed');
