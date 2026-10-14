import assert from 'node:assert/strict';
import * as X from '../public/shared/library.js';
import * as V from '../api/_lib/biz-validate.js';
import * as C from '../public/shared/calendar.js';
import { ValidationError } from '../api/_lib/validate.js';
const throws = (f, re) => assert.throws(f, (e) => e instanceof ValidationError && (!re || re.test(e.message)));

// file names
assert.equal(X.fileExt('A.PDF'), 'pdf'); assert.equal(X.fileExt('noext'), '');
assert.equal(X.safeFileName('../../etc/passwd.pdf'), 'etcpasswd.pdf');
assert.equal(X.safeFileName('My Policy (v2).PDF'), 'My-Policy-v2.pdf');
assert.ok(!X.safeFileName('a/b\\c.pdf').includes('/'));

// who may upload
assert.ok(X.canUpload({ uid: 'o', role: 'owner' }, null));
assert.ok(!X.canUpload({ uid: 'm', role: 'manager' }, null));
assert.ok(X.canUpload({ uid: 'm', role: 'manager' }, { roles: ['manager'] }));
assert.ok(X.canUpload({ uid: 'e', role: 'employee' }, { uids: ['e'] }));
assert.ok(!X.canUpload({ uid: 'm', role: 'manager', status: 'inactive' }, { roles: ['manager'] }));

// visibility
const members = new Map([['o', { uid: 'o', role: 'owner' }], ['m', { uid: 'm', role: 'manager' }], ['e', { uid: 'e', role: 'employee' }], ['x', { uid: 'x', role: 'employee', status: 'inactive' }]]);
assert.deepEqual(X.docVisibleTo(members, { uploaderId: 'm', access: {} }).sort(), ['m', 'o']);
assert.deepEqual(X.docVisibleTo(members, { uploaderId: 'm', access: { roles: ['employee'] } }).sort(), ['e', 'm', 'o']);
assert.deepEqual(X.docVisibleTo(members, { uploaderId: 'o', access: { uids: ['e'] } }).sort(), ['e', 'o']);

// expiry
assert.equal(X.expiryState(null, '2026-10-12').state, 'none');
assert.equal(X.expiryState('2026-10-11', '2026-10-12').state, 'expired');
assert.equal(X.expiryState('2026-10-12', '2026-10-12').state, 'soon');
assert.equal(X.expiryState('2026-11-11', '2026-10-12').state, 'soon');
assert.equal(X.expiryState('2026-11-12', '2026-10-12').state, 'ok');

// gmail link
const g = X.gmailLink({ to: 'a@b.co', subject: 'Re: x & y', body: 'hi\nthere' });
assert.ok(g.startsWith('https://mail.google.com/mail/?view=cm') && g.includes('to=a%40b.co') && g.includes('%26') && g.includes('%0A'));
assert.equal(X.ticketRef(7), '#0007');

// validators
throws(() => V.sanitizeUpload({ name: 'a.exe', size: 1, access: {} }), /not allowed/);
throws(() => V.sanitizeUpload({ name: 'a.pdf', size: 0, access: {} }), /empty/);
throws(() => V.sanitizeUpload({ name: 'a.pdf', size: 16 * 1048576, access: {} }), /15 MB/);
throws(() => V.sanitizeUpload({ name: 'a.pdf', size: 5, category: 'bogus', access: {} }), /type/);
throws(() => V.sanitizeUpload({ name: 'a.pdf', size: 5, expiresOn: '2026-13-45', access: {} }), /expiry/);
throws(() => V.sanitizeUpload({ name: 'a.pdf', size: 5, access: { roles: ['owner'] } }), /role/);
const ok1 = V.sanitizeUpload({ name: 'Cover.PDF', size: 99, access: { roles: ['manager', 'manager'], uids: ['u1', 'u1'] } });
assert.deepEqual(ok1.access, { roles: ['manager'], uids: ['u1'] }); assert.equal(ok1.title, 'Cover'); assert.equal(ok1.fileName, 'Cover.pdf');
throws(() => V.sanitizeLink({ title: 't', link: 'http://x.co', access: {} }), /https/);
throws(() => V.sanitizeLink({ title: 't', link: 'javascript:alert(1)', access: {} }), /https|link/);
assert.ok(V.sanitizeLink({ title: 't', link: 'https://x.co/a', access: {} }).link.startsWith('https://x.co'));
throws(() => V.sanitizeInquiry({ name: 'a', email: 'bad', subject: 's', message: 'm' }), /email/);
throws(() => V.sanitizeInquiry({ name: 'a', email: 'a@b.co', subject: '', message: 'm' }), /Subject/);
assert.equal(V.sanitizeInquiry({ name: ' a ', email: 'A@B.CO', subject: 's', message: 'm' }).email, 'a@b.co');
throws(() => V.sanitizeStatus('nope')); assert.equal(V.sanitizeStatus('closed'), 'closed');
throws(() => V.sanitizeAgents({ uids: 'x' }));

// ---- calendar rules
assert.equal(C.canPost({ role: 'owner', uid: 'o' }, {}), true);
assert.equal(C.canPost({ role: 'employee', uid: 'e' }, {}), false);
assert.equal(C.canPost({ role: 'manager', uid: 'm' }, { roles: ['manager'] }), true);
assert.equal(C.canPost({ role: 'employee', uid: 'e' }, { uids: ['e'] }), true);
assert.equal(C.canPost({ role: 'manager', uid: 'm', status: 'inactive' }, { roles: ['manager'] }), false);
assert.equal(C.canPost(null, {}), false);
assert.equal(C.addDays('2026-02-27', 2), '2026-03-01');
assert.equal(C.weekStartKey('2026-10-14'), '2026-10-12');
assert.equal(C.addMonths('2026-12-15', 1), '2027-01-01');
assert.equal(C.daysInMonth('2028-02-10'), 29);
const g2 = C.monthGrid('2026-10-14');
assert.ok(g2.length >= 4 && g2.length <= 6 && g2.every((w) => w.length === 7) && g2[0][0] <= '2026-10-01' && g2.at(-1)[6] >= '2026-10-31');
assert.equal(C.onDay({ date: '2026-10-10', endDate: '2026-10-12' }, '2026-10-11'), true);
assert.equal(C.onDay({ date: '2026-10-10' }, '2026-10-11'), false);
const evs = [{ title: 'B', date: '2026-10-10', allDay: false, startTime: '10:00' }, { title: 'A', date: '2026-10-10', allDay: true }];
assert.equal(C.eventsOn(evs, '2026-10-10')[0].title, 'A');
assert.equal(C.timeLabel({ allDay: false, startTime: '09:00', endTime: '10:30' }), '09:00 – 10:30');
assert.equal(C.timeLabel({ allDay: true }), 'All day');
assert.equal(C.upcoming([{ title: 'x', date: '2026-01-01' }, { title: 'y', date: '2026-10-20' }], '2026-10-13').length, 1);
const ev1 = V.sanitizeEvent({ title: ' Toolbox talk ', type: 'meeting', date: '2026-10-20', startTime: '08:00', endTime: '09:00' });
assert.equal(ev1.title, 'Toolbox talk'); assert.equal(ev1.allDay, false); assert.equal(ev1.endDate, '2026-10-20');
assert.equal(V.sanitizeEvent({ title: 'Closed', type: 'holiday', date: '2026-12-25' }).allDay, true);
throws(() => V.sanitizeEvent({ title: '', date: '2026-10-20' }), /title/);
throws(() => V.sanitizeEvent({ title: 'x', type: 'bogus', date: '2026-10-20' }), /type/);
throws(() => V.sanitizeEvent({ title: 'x', date: '2026-13-01' }), /date/);
throws(() => V.sanitizeEvent({ title: 'x', date: '2026-10-20', endDate: '2026-10-19' }), /before/);
throws(() => V.sanitizeEvent({ title: 'x', date: '2026-10-01', endDate: '2026-12-01' }), /days/);
throws(() => V.sanitizeEvent({ title: 'x', date: '2026-10-20', startTime: '9am' }), /start time/);
throws(() => V.sanitizeEvent({ title: 'x', date: '2026-10-20', startTime: '10:00', endTime: '09:00' }), /after/);
throws(() => V.sanitizeEvent(null));
assert.deepEqual(V.sanitizePosters({ roles: ['manager'], uids: ['u1'] }), { roles: ['manager'], uids: ['u1'] });
throws(() => V.sanitizePosters({ roles: ['owner'] }), /role/);

// ---- profile picture
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]).toString('base64');
assert.equal(V.sanitizePhoto(jpeg), jpeg);
assert.equal(V.sanitizePhoto(null), null); assert.equal(V.sanitizePhoto(''), null);
throws(() => V.sanitizePhoto(5), /invalid/);
throws(() => V.sanitizePhoto('data:image/png;base64,AAAA'), /JPEG/);
throws(() => V.sanitizePhoto('data:image/jpeg;base64,' + Buffer.from('not a jpeg at all').toString('base64')), /valid picture/);
throws(() => V.sanitizePhoto('data:image/jpeg;base64,' + 'A'.repeat(60001)), /too large/);
throws(() => V.sanitizePhoto('https://evil.example/x.jpg'), /JPEG/);
console.log('biz tests passed');
