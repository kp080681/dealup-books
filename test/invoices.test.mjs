import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, seriesSeq, nextSeq, supplyType, computeInvoice, amountInWords, toMinor } from '../lib/invoices.js';

test('numbering per financial year', () => {
  assert.equal(formatNumber('DU/INV', 2026, 9), 'DU/INV/2026-27/009');
  assert.equal(seriesSeq('DU/INV/2026-27/005', 'DU/INV', 2026), 5);
  assert.equal(seriesSeq('DU/INV/2025-26/005', 'DU/INV', 2026), null);
  assert.equal(seriesSeq('INV-000019', 'DU/INV', 2026), null);
  assert.equal(nextSeq(['DU/INV/2026-27/004', 'DU/INV/2026-27/005', 'INV-000019', 'DU/INV/2026-27/005'], 'DU/INV', 2026), 6);
  assert.equal(nextSeq([], 'DU/INV', 2027), 1);
});

test('supply type', () => {
  assert.equal(supplyType({ clientCountry: 'India', clientState: 'Karnataka', companyState: 'Karnataka' }), 'intra');
  assert.equal(supplyType({ clientCountry: 'India', clientState: 'Kerala', companyState: 'Karnataka' }), 'inter');
  assert.equal(supplyType({ clientCountry: 'United Arab Emirates', clientState: '', companyState: 'Karnataka' }), 'export');
});

test('GST maths', () => {
  const items = [{ description: 'Google Ads management', sac: '998366', qty: 1, rate: '15,000' }, { description: 'Statics', qty: 3, rate: 1500.5 }, { description: '', qty: 1, rate: 100 }];
  const intra = computeInvoice(items, { type: 'intra', gstRate: 18 });
  assert.equal(intra.lines.length, 2);
  assert.equal(intra.subtotal, 1950150);
  assert.equal(intra.cgst, 175514);
  assert.equal(intra.sgst, 175514);
  assert.equal(intra.igst, 0);
  assert.equal(intra.total, 1950150 + 351028);
  const inter = computeInvoice(items, { type: 'inter', gstRate: 18 });
  assert.equal(inter.igst, 351027);
  const exp = computeInvoice(items, { type: 'export', gstRate: 18 });
  assert.equal(exp.total, exp.subtotal);
  assert.equal(exp.gstRate, 0);
  const waived = computeInvoice(items, { type: 'intra', gstRate: 18, waived: true });
  assert.equal(waived.total, waived.subtotal);
  assert.equal(toMinor('1,925.50'), 192550);
});

test('amount in words', () => {
  assert.equal(amountInWords(826000, 'INR'), 'Rupees Eight Thousand Two Hundred Sixty Only');
  assert.equal(amountInWords(12345678900, 'INR'), 'Rupees Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine Only');
  assert.equal(amountInWords(192550, 'AED'), 'UAE Dirhams One Thousand Nine Hundred Twenty-Five and Fifty Fils Only');
});
