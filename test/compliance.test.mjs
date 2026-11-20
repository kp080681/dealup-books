import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, fyOf, standing, reminderKind, addDays, daysBetween } from '../lib/compliance.js';

const dealup = {
  state: 'Karnataka', incorporation_date: '2025-04-20', first_fy_end: '2026-03-31', small_company: true,
  gst_registered: true, gst_scheme: 'monthly', exports_lut: true, deducts_tds: true, pt_registered: true,
  director_loans: true, msme_vendors: false, dir_kyc_last_fy: '',
};
const byKey = (items) => Object.fromEntries(items.map((i) => [i.key, i]));

test('financial year of a date', () => {
  assert.equal(fyOf('2026-03-31'), 2025);
  assert.equal(fyOf('2026-04-01'), 2026);
});

test('TDS is due on the 7th, except March which is due 30 April', () => {
  const k = byKey(buildCalendar(dealup, 2026));
  assert.equal(k['tds-pay:2026-10'].due, '2026-11-07');
  assert.equal(k['tds-pay:2026-12'].due, '2027-01-07');
  assert.equal(k['tds-pay:2027-03'].due, '2027-04-30');
  assert.equal(Object.keys(k).filter((x) => x.startsWith('tds-pay:')).length, 12);
  assert.equal(k['tds-return:2026-Q4'].due, '2027-05-31');
  assert.equal(k['tds-return:2026-Q2'].due, '2026-10-31');
});

test('monthly GST: GSTR-1 on the 11th, GSTR-3B on the 20th', () => {
  const k = byKey(buildCalendar(dealup, 2026));
  assert.equal(k['gstr1:2026-10'].due, '2026-11-11');
  assert.equal(k['gstr3b:2026-10'].due, '2026-11-20');
  assert.equal(k['lut:2027'].due, '2027-03-31');
});

test('quarterly GST in Karnataka: 3B on the 22nd, PMT-06 on the 25th', () => {
  const k = byKey(buildCalendar({ ...dealup, gst_scheme: 'qrmp' }, 2026));
  assert.equal(k['gstr3b:2026-06'].due, '2026-07-22');
  assert.equal(k['gstr1:2026-06'].due, '2026-07-13');
  assert.equal(k['gst-pmt06:2026-04'].due, '2026-05-25');
  assert.equal(k['gstr3b:2026-04'], undefined);
  const delhi = byKey(buildCalendar({ ...dealup, gst_scheme: 'qrmp', state: 'Delhi' }, 2026));
  assert.equal(delhi['gstr3b:2026-06'].due, '2026-07-24');
});

test('first AGM within 9 months of the first year end; ROC filings follow the AGM', () => {
  const k = byKey(buildCalendar(dealup, 2025));
  assert.equal(k['agm:2025'].due, '2026-12-31');
  assert.equal(k['aoc4:2025'].due, '2027-01-30');
  assert.equal(k['mgt7:2025'].due, '2027-03-01');
  assert.ok(k['adt1:2025']);
  assert.ok(k['inc20a']);
  assert.equal(k['inc20a'].due, '2025-10-17');
  // Once the AGM is held, the filings count from the real date.
  const held = byKey(buildCalendar(dealup, 2025, { 'agm:2025': '2026-12-10' }));
  assert.equal(held['aoc4:2025'].due, '2027-01-09');
  assert.equal(held['adt1:2025'].due, '2026-12-25');
  // Later years: AGM by 30 September, no ADT-1.
  const next = byKey(buildCalendar(dealup, 2026));
  assert.equal(next['agm:2026'].due, '2027-09-30');
  assert.equal(next['adt1:2026'], undefined);
  assert.equal(next['inc20a'], undefined);
});

test('optional items only when they apply', () => {
  const none = buildCalendar({ ...dealup, deducts_tds: false, pt_registered: false, gst_registered: false, director_loans: false }, 2026);
  assert.ok(!none.some((i) => /^(tds|pt|gst|dpt3|lut)/.test(i.key)));
  assert.ok(none.some((i) => i.key === 'itr:2026'));
});

test('director KYC every 3 years', () => {
  assert.ok(byKey(buildCalendar({ ...dealup, dir_kyc_last_fy: '2025' }, 2028))['dir3kyc:2028']);
  assert.equal(byKey(buildCalendar({ ...dealup, dir_kyc_last_fy: '2025' }, 2026))['dir3kyc:2026'], undefined);
  assert.equal(byKey(buildCalendar(dealup, 2026))['dir3kyc:2026'].due, '2026-06-30');
});

test('keys are unique and items sorted by due date', () => {
  const items = buildCalendar(dealup, 2026);
  assert.equal(new Set(items.map((i) => i.key)).size, items.length);
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].due <= items[i].due);
});

test('standing and reminders', () => {
  const it = { due: '2026-12-07' };
  assert.equal(standing(it, '2026-12-08'), 'overdue');
  assert.equal(standing(it, '2026-12-01'), 'soon');
  assert.equal(standing(it, '2026-11-20'), 'later');
  assert.equal(standing({ ...it, done_on: '2026-12-05' }, '2026-12-08'), 'done');
  assert.equal(reminderKind(it, '2026-11-30'), 'week');
  assert.equal(reminderKind(it, '2026-12-06'), 'day');
  assert.equal(reminderKind(it, '2026-12-08'), 'overdue1');
  assert.equal(reminderKind(it, '2026-12-05'), null);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-11-20', '2026-12-07'), 17);
});

test('nothing before incorporation', () => {
  assert.deepEqual(buildCalendar(dealup, 2024), []);
  const k = byKey(buildCalendar(dealup, 2025));
  assert.equal(k['tds-pay:2025-03'], undefined);
  assert.ok(k['tds-pay:2025-04']);
  assert.equal(byKey(buildCalendar({ ...dealup, incorporation_date: '2025-06-10' }, 2025))['tds-pay:2025-05'], undefined);
});
