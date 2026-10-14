import assert from 'node:assert/strict';
import * as L from '../public/lib.js';

// totals
assert.deepEqual(L.lineTotals([{ qty: 2, price: 100 }, { qty: 1, price: 50.5 }], false), { sub: 250.5, vat: 0, total: 250.5 });
assert.deepEqual(L.lineTotals([{ qty: 3, price: 33.33 }], true), { sub: 99.99, vat: 15, total: 114.99 });
assert.deepEqual(L.lineTotals([], true), { sub: 0, vat: 0, total: 0 });
// half-cent VAT must round up, not down (37.575 -> 37.58)
assert.deepEqual(L.lineTotals([{ qty: 1, price: 250.5 }], true), { sub: 250.5, vat: 37.58, total: 288.08 });
assert.deepEqual(L.lineTotals([{ qty: 2, price: 17.99 }], true), { sub: 35.98, vat: 5.4, total: 41.38 });
assert.deepEqual(L.lineTotals([{ qty: 1, price: 0.1 }, { qty: 1, price: 0.2 }], false), { sub: 0.3, vat: 0, total: 0.3 });
assert.equal(L.round2(1.005), 1.01);
assert.equal(L.round2(2.675), 2.68);
assert.equal(L.round2(-0.004), 0);
assert.equal(L.round2('abc'), 0);
assert.equal(L.lineTotals([{ qty: '2', price: '10' }]).total, 20);
assert.equal(L.lineTotals([{ qty: 'x', price: 10 }]).total, 0);

// doc numbers
const n = L.docNumber('INV', new Date(2026, 9, 8), () => 0.5);
assert.match(n, /^INV-20261008-[0-9A-Z]{4}$/);

// limits
assert.deepEqual(L.jobsLimitState({ jobsPerMonth: 5 }, 4), { unlimited: false, reached: false, remaining: 1, max: 5 });
assert.equal(L.jobsLimitState({ jobsPerMonth: 5 }, 5).reached, true);
assert.equal(L.jobsLimitState({ jobsPerMonth: -1 }, 999).reached, false);
assert.equal(L.jobsLimitState(undefined, 0).reached, true);

// month start
assert.equal(L.startOfMonth(new Date(2026, 9, 18, 15)), new Date(2026, 9, 1).getTime());

// overdue
const now = Date.now();
assert.equal(L.isOverdue({ status: 'sent', dueAt: now - 1000 }, now), true);
assert.equal(L.isOverdue({ status: 'paid', dueAt: now - 1000 }, now), false);
assert.equal(L.isOverdue({ status: 'sent', dueAt: now + 1000 }, now), false);
assert.equal(L.isOverdue({ status: 'sent' }, now), false);

// dates round trip
const ms = L.fromDateInput('2026-10-08');
assert.equal(L.toDateInput(ms), '2026-10-08');
assert.equal(L.fromDateInput(''), null);
assert.equal(L.toDateInput(null), '');

// whatsapp
assert.equal(L.waLink('082 123 4567', 'hi there').startsWith('https://wa.me/27821234567?text='), true);
assert.equal(L.waLink('+27 82 123 4567', 'x').startsWith('https://wa.me/27821234567?'), true);
assert.equal(L.waLink('0027821234567', 'x').startsWith('https://wa.me/27821234567?'), true);
assert.equal(L.waLink('', 'x'), 'https://wa.me/?text=x');
assert.match(L.waLink('0821234567', 'a b&c'), /text=a%20b%26c$/);

// csv
const csv = L.toCsv(
  [{ a: 'x,y', b: 'say "hi"' }, { a: 1, b: null }],
  [{ label: 'A', get: (r) => r.a }, { label: 'B', get: (r) => r.b }],
);
assert.equal(csv, 'A,B\r\n"x,y","say ""hi"""\r\n1,');

// escaping and safety
assert.equal(L.esc(`<img src=x onerror="a">&'`), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
assert.equal(L.safeImg('javascript:alert(1)'), '');
assert.equal(L.safeImg('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
assert.equal(L.safeImg('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
// a stored value must never be able to break out of the src="" attribute
assert.equal(L.safeImg('data:image/png;base64,AAAA" onerror="alert(1)'), '');
assert.equal(L.safeImg("data:image/png;base64,AAAA'><script>"), '');
assert.equal(L.safeImg('data:image/svg+xml;base64,AAAA'), '');
assert.equal(L.safeImg('data:image/png;base64,AA AA'), '');

// csv: text that would run as a spreadsheet formula is neutralised; numbers and phone numbers are not
assert.equal(
  L.toCsv(
    [{ a: '=1+1', b: '+27821234567' }, { a: '@SUM(A1)', b: -5 }, { a: '-cmd', b: 'ok' }],
    [{ label: 'A', get: (r) => r.a }, { label: 'B', get: (r) => r.b }],
  ),
  "A,B\r\n'=1+1,+27821234567\r\n'@SUM(A1),-5\r\n'-cmd,ok",
);
assert.equal(L.safeUrl('http://x.com/a.png'), '');
assert.equal(L.safeUrl('https://x.com/a.png'), 'https://x.com/a.png');

// cert types
for (const [k, v] of Object.entries(L.CERT_TYPES)) assert.ok(v.label && v.checks.length > 0, k);

// monthly usage key follows South African time (UTC+2), not the server's or browser's zone
assert.equal(L.monthKeySAST(Date.UTC(2026, 9, 15, 12, 0)), '2026-10');
assert.equal(L.monthKeySAST(Date.UTC(2026, 9, 31, 21, 59)), '2026-10'); // 23:59 on 31 Oct in SA
assert.equal(L.monthKeySAST(Date.UTC(2026, 9, 31, 22, 0)), '2026-11'); //  00:00 on 1 Nov in SA
assert.equal(L.monthKeySAST(Date.UTC(2026, 11, 31, 22, 30)), '2027-01'); // year rollover

console.log('lib tests passed');
