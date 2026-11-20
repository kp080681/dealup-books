// Invoice maths and numbering. Pure functions, so they can be tested.
// Amounts are kept in minor units (paise, fils, cents) as integers.

import { fyOf } from './compliance.js';

export const CURRENCIES = ['INR', 'AED', 'USD', 'EUR', 'GBP'];
export const GST_RATES = [18, 12, 5, 0];

const pad3 = (n) => String(n).padStart(3, '0');
export const fyCode = (fy) => `${fy}-${String(fy + 1).slice(2)}`;

// DU/INV/2026-27/009
export function formatNumber(prefix, fy, seq) {
  return `${prefix || 'DU/INV'}/${fyCode(fy)}/${pad3(seq)}`;
}

// The sequence number of an invoice in a year's series, or null if it isn't one.
export function seriesSeq(number, prefix, fy) {
  const p = (prefix || 'DU/INV').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${p}/${fyCode(fy)}/(\\d{1,5})$`, 'i').exec(String(number || '').trim());
  return m ? Number(m[1]) : null;
}

export function nextSeq(numbers, prefix, fy) {
  let max = 0;
  for (const n of numbers) {
    const s = seriesSeq(n, prefix, fy);
    if (s && s > max) max = s;
  }
  return max + 1;
}

// How GST applies: same state (CGST + SGST), another state (IGST), or export (zero-rated under LUT).
export function supplyType({ clientCountry, clientState, companyState }) {
  const country = String(clientCountry || 'India').trim().toLowerCase();
  if (country && country !== 'india') return 'export';
  return String(clientState || '').trim().toLowerCase() === String(companyState || '').trim().toLowerCase() ? 'intra' : 'inter';
}

export const toMinor = (v) => Math.round(Number(String(v).replace(/[,\s]/g, '')) * 100);

/**
 * @param {Array<{description, sac, qty, rate}>} items  rate in major units
 * @param {{type: 'intra'|'inter'|'export', gstRate: number, waived?: boolean}} opts
 */
export function computeInvoice(items, { type, gstRate = 18, waived = false }) {
  const lines = items
    .map((it) => ({
      description: String(it.description || '').trim(),
      sac: String(it.sac || '').trim(),
      qty: Number(it.qty),
      rate_minor: toMinor(it.rate),
    }))
    .filter((l) => l.description && l.qty > 0 && Number.isFinite(l.rate_minor) && l.rate_minor >= 0)
    .map((l) => ({ ...l, amount_minor: Math.round(l.qty * l.rate_minor) }));
  const subtotal = lines.reduce((a, l) => a + l.amount_minor, 0);
  const rate = type === 'export' || waived ? 0 : Number(gstRate) || 0;
  let cgst = 0, sgst = 0, igst = 0;
  if (rate > 0) {
    if (type === 'intra') {
      cgst = Math.round((subtotal * rate) / 200);
      sgst = cgst;
    } else {
      igst = Math.round((subtotal * rate) / 100);
    }
  }
  return { lines, subtotal, cgst, sgst, igst, total: subtotal + cgst + sgst + igst, gstRate: rate };
}

export const fmtMoney = (minor, currency = 'INR') => {
  const n = Number(minor) / 100;
  const s = n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${s}`;
};

// ----- Amount in words -----
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const parts = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' ');
}
function indianWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}
function intlWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  for (const [v, w] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]) {
    if (n >= v) { parts.push(`${under1000(Math.floor(n / v))} ${w}`); n %= v; }
  }
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}
const UNIT = { INR: ['Rupees', 'Paise'], AED: ['UAE Dirhams', 'Fils'], USD: ['US Dollars', 'Cents'], EUR: ['Euros', 'Cents'], GBP: ['Pounds Sterling', 'Pence'] };
export function amountInWords(minor, currency = 'INR') {
  const whole = Math.floor(minor / 100), frac = minor % 100;
  const [big, small] = UNIT[currency] || [currency, 'Cents'];
  const words = currency === 'INR' ? indianWords(whole) : intlWords(whole);
  return `${big} ${words}${frac ? ` and ${currency === 'INR' ? indianWords(frac) : intlWords(frac)} ${small}` : ''} Only`;
}

export { fyOf };
