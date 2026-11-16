import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry } from '../lib/parse.js';

const NOW = new Date('2026-11-16T10:30:00Z'); // 16 Nov 2026, 4 pm IST
const p = (t) => parseEntry(t, NOW);

test('the brief example', () => {
  const r = p('paid Preethesh 20,000 from HDFC for September');
  assert.equal(r.direction, 'paid'); assert.equal(r.amount, '20000'); assert.equal(r.account, 'HDFC');
  assert.equal(r.party, 'Preethesh'); assert.equal(r.period_month, '2026-09');
  assert.equal(r.category, 'Performance marketing fees'); assert.equal(r.entry_date, '2026-11-16');
  assert.equal(r.question, ''); assert.match(r.flags.join(' '), /TDS/); assert.match(r.note, /4 client/);
});
test('Preethesh defaults: HDFC and the month just ended', () => {
  const r = p('paid preethesh 15k');
  assert.equal(r.account, 'HDFC'); assert.equal(r.period_month, '2026-10'); assert.equal(r.amount, '15000'); assert.equal(r.question, '');
});
test('receipt with client, date and lakh', () => {
  const r = p('Received 1.5 lakh from Shresht Eye Care in IOB on 12 Nov');
  assert.equal(r.direction, 'received'); assert.equal(r.amount, '150000'); assert.equal(r.account, 'IOB');
  assert.equal(r.party, 'Shresht Eye Care'); assert.equal(r.entry_date, '2026-11-12'); assert.equal(r.category, 'Client receipt');
});
test('date numbers are not taken as the amount', () => {
  const r = p('paid rent 18000 from IOB on 05/11/2026');
  assert.equal(r.amount, '18000'); assert.equal(r.entry_date, '2026-11-05'); assert.equal(r.category, 'Rent');
});
test('director-paid expense is flagged, not decided', () => {
  const r = p('paid 2,499 for Canva subscription from my own pocket yesterday');
  assert.equal(r.account, 'Director (personal)'); assert.equal(r.amount, '2499'); assert.equal(r.entry_date, '2026-11-15');
  assert.equal(r.category, 'Software & subscriptions'); assert.match(r.flags.join(' '), /CA to confirm/);
});
test('asks exactly one question when the account is missing', () => {
  const r = p('paid 5000 to Ramesh for printing');
  assert.equal(r.party, 'Ramesh'); assert.equal(r.question, 'Which account: HDFC, IOB, cash or paid personally?');
});
test('asks for the amount first', () => {
  assert.equal(p('paid Preethesh from HDFC').question, 'What was the amount?');
});
test('a month later in the year means last year', () => {
  assert.equal(p('paid Preethesh 10000 from HDFC for December').period_month, '2025-12');
});
test('rupee sign and paise', () => {
  const r = p('₹1,180.50 bank charges debited from HDFC');
  assert.equal(r.amount, '1180.5'); assert.equal(r.category, 'Bank charges'); assert.equal(r.direction, 'paid');
});
test('client keyword', () => {
  const r = p('paid 12000 google ads for client Uro Health Plus from HDFC');
  assert.equal(r.client, 'Uro Health Plus'); assert.equal(r.category, 'Ad spend (client)'); assert.equal(r.amount, '12000');
});
