// Builds the invoice PDF. A4, plain and clear, so a client or the CA can read it at a glance.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { amountInWords } from './invoices.js';

const INK = rgb(0.09, 0.13, 0.16);
const MUTE = rgb(0.36, 0.42, 0.47);
const LINE = rgb(0.85, 0.88, 0.91);
const BRAND = rgb(0.04, 0.36, 0.68);

// The built-in PDF fonts only cover Western European characters.
const safe = (s) => String(s ?? '').replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

const money = (minor, currency) => {
  const n = Number(minor) / 100;
  return n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const niceDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y}`;
};

function wrap(text, font, size, width) {
  const out = [];
  for (const para of safe(text).split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/**
 * @param {object} inv  invoice row (amounts in minor units, items with amount_minor)
 * @param {object} co   company profile
 * @returns {Promise<Uint8Array>}
 */
export async function buildInvoicePdf(inv, co) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`Invoice ${inv.number}`));
  pdf.setAuthor(safe(co.legal_name || 'DealUp Strategies Private Limited'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const text = (s, x, yy, { size = 9, f = font, color = INK, align = 'left', maxW } = {}) => {
    const str = safe(s);
    const w = f.widthOfTextAtSize(str, size);
    const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(maxW && w > maxW ? str.slice(0, Math.floor(str.length * maxW / w)) : str, { x: xx, y: yy, size, font: f, color });
  };
  const hr = (yy, color = LINE, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.7, color });
  const newPageIfNeeded = (need) => {
    if (y - need < M + 40) { page = pdf.addPage([W, H]); y = H - M; }
  };

  // ---- Header: company on the left, invoice details on the right ----
  const exportSupply = inv.supply_type === 'export';
  text(co.legal_name || 'DealUp Strategies Private Limited', M, y - 4, { size: 15, f: bold, color: BRAND });
  y -= 20;
  for (const ln of wrap(co.address, font, 8.5, 300)) { text(ln, M, y, { size: 8.5, color: MUTE }); y -= 11; }
  const ids = [co.gstin && `GSTIN ${co.gstin}`, co.cin && `CIN ${co.cin}`, co.pan && `PAN ${co.pan}`].filter(Boolean).join('   ');
  if (ids) { text(ids, M, y, { size: 8.5, color: MUTE }); y -= 11; }
  const contact = [co.business_email, co.phone].filter(Boolean).join('   ');
  if (contact) { text(contact, M, y, { size: 8.5, color: MUTE }); y -= 11; }

  let ry = H - M - 4;
  text(exportSupply ? 'INVOICE' : 'TAX INVOICE', W - M, ry, { size: 15, f: bold, align: 'right' });
  ry -= 20;
  const meta = [
    ['Invoice No.', inv.number],
    ['Invoice date', niceDate(inv.invoice_date)],
    inv.due_date ? ['Due date', niceDate(inv.due_date)] : null,
    ['Place of supply', exportSupply ? 'Outside India' : inv.client_state],
  ].filter(Boolean);
  for (const [k, v] of meta) {
    text(k, W - M - 150, ry, { size: 8.5, color: MUTE });
    text(v, W - M, ry, { size: 8.5, f: bold, align: 'right' });
    ry -= 12;
  }
  y = Math.min(y, ry) - 10;
  hr(y);
  y -= 16;

  // ---- Bill to ----
  text('BILL TO', M, y, { size: 8, f: bold, color: MUTE });
  y -= 13;
  text(inv.client_name, M, y, { size: 11, f: bold });
  y -= 13;
  for (const ln of wrap(inv.client_address, font, 9, 320)) { text(ln, M, y, { size: 9 }); y -= 11; }
  const clientIds = [inv.client_gstin && `GSTIN ${inv.client_gstin}`, inv.client_state, inv.client_country !== 'India' ? inv.client_country : ''].filter(Boolean).join('   ');
  if (clientIds) { text(clientIds, M, y, { size: 9, color: MUTE }); y -= 11; }
  if (exportSupply) {
    y -= 4;
    text(`Export of services under LUT${co.lut_number ? ` ${co.lut_number}` : ''}, without payment of IGST (zero-rated).`, M, y, { size: 8.5, f: bold, color: BRAND });
    y -= 11;
  }
  y -= 12;

  // ---- Items table ----
  // x positions; qty, rate and amount are right edges.
  const cols = { no: M, desc: M + 22, sac: W - M - 230, qty: W - M - 165, rate: W - M - 90, amt: W - M - 4 };
  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: rgb(0.94, 0.96, 0.98) });
    text('#', cols.no + 4, y, { size: 8, f: bold, color: MUTE });
    text('Description', cols.desc, y, { size: 8, f: bold, color: MUTE });
    text('SAC', cols.sac, y, { size: 8, f: bold, color: MUTE });
    text('Qty', cols.qty, y, { size: 8, f: bold, color: MUTE, align: 'right' });
    text(`Rate (${inv.currency})`, cols.rate, y, { size: 8, f: bold, color: MUTE, align: 'right' });
    text(`Amount (${inv.currency})`, cols.amt, y, { size: 8, f: bold, color: MUTE, align: 'right' });
    y -= 20;
  };
  head();
  (inv.items || []).forEach((it, i) => {
    const lines = wrap(it.description, font, 9, cols.sac - cols.desc - 10);
    newPageIfNeeded(lines.length * 11 + 10);
    if (y === H - M) head();
    text(String(i + 1), cols.no + 4, y, { size: 9 });
    lines.forEach((ln, j) => text(ln, cols.desc, y - j * 11, { size: 9 }));
    text(it.sac || '', cols.sac, y, { size: 9 });
    text(String(it.qty), cols.qty, y, { size: 9, align: 'right' });
    text(money(it.rate_minor, inv.currency), cols.rate, y, { size: 9, align: 'right' });
    text(money(it.amount_minor, inv.currency), cols.amt, y, { size: 9, align: 'right' });
    y -= lines.length * 11 + 6;
    hr(y + 2);
    y -= 8;
  });

  // ---- Totals ----
  newPageIfNeeded(120);
  const rate = Number(inv.gst_rate);
  const totals = [['Subtotal', inv.subtotal_minor]];
  if (inv.supply_type === 'intra' && rate > 0) {
    totals.push([`CGST @ ${rate / 2}%`, inv.cgst_minor], [`SGST @ ${rate / 2}%`, inv.sgst_minor]);
  } else if (inv.supply_type === 'inter' && rate > 0) {
    totals.push([`IGST @ ${rate}%`, inv.igst_minor]);
  } else if (exportSupply) {
    totals.push(['IGST @ 0% (export, zero-rated)', 0]);
  }
  for (const [k, v] of totals) {
    text(k, W - M - 200, y, { size: 9, color: MUTE });
    text(money(v, inv.currency), W - M - 4, y, { size: 9, align: 'right' });
    y -= 13;
  }
  y -= 6;
  page.drawRectangle({ x: W - M - 210, y: y - 6, width: 210, height: 20, color: rgb(0.94, 0.96, 0.98) });
  text('Total', W - M - 200, y, { size: 10.5, f: bold });
  text(`${inv.currency} ${money(inv.total_minor, inv.currency)}`, W - M - 4, y, { size: 10.5, f: bold, align: 'right' });
  y -= 22;
  for (const ln of wrap(amountInWords(Number(inv.total_minor), inv.currency), font, 8.5, W - 2 * M)) { text(ln, M, y, { size: 8.5, color: MUTE }); y -= 11; }
  if (inv.gst_waived_reason) { y -= 2; text(`No GST charged: ${inv.gst_waived_reason}`, M, y, { size: 8.5, color: MUTE }); y -= 11; }
  if (exportSupply && inv.fx_rate) {
    text(`Indicative exchange rate: 1 ${inv.currency} = INR ${Number(inv.fx_rate).toFixed(2)}`, M, y, { size: 8.5, color: MUTE });
    y -= 11;
  }
  y -= 10;

  // ---- Bank details and notes ----
  const bank = [
    ['Account name', co.legal_name],
    ['Bank', [co.bank_name, co.bank_branch].filter(Boolean).join(', ')],
    ['Account no.', co.bank_account],
    ['IFSC', co.bank_ifsc],
    exportSupply && co.bank_swift ? ['SWIFT', co.bank_swift] : null,
  ].filter((r) => r && r[1]);
  if (bank.length) {
    newPageIfNeeded(bank.length * 12 + 30);
    hr(y + 6);
    y -= 8;
    text('PAYMENT DETAILS', M, y, { size: 8, f: bold, color: MUTE });
    y -= 13;
    for (const [k, v] of bank) { text(k, M, y, { size: 9, color: MUTE }); text(v, M + 90, y, { size: 9 }); y -= 12; }
    y -= 6;
  }
  if (inv.notes) {
    const lines = wrap(inv.notes, font, 8.5, W - 2 * M);
    newPageIfNeeded(lines.length * 11 + 20);
    text('NOTES', M, y, { size: 8, f: bold, color: MUTE });
    y -= 12;
    for (const ln of lines) { text(ln, M, y, { size: 8.5 }); y -= 11; }
    y -= 6;
  }

  // ---- Signature ----
  newPageIfNeeded(50);
  y -= 10;
  text(`For ${co.legal_name || 'DealUp Strategies Private Limited'}`, W - M, y, { size: 9, f: bold, align: 'right' });
  y -= 34;
  text('Authorised Signatory', W - M, y, { size: 9, color: MUTE, align: 'right' });

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`${inv.number} - computer-generated invoice${pages.length > 1 ? ` - page ${i + 1} of ${pages.length}` : ''}`), { x: M, y: 24, size: 7.5, font, color: MUTE });
  });
  return pdf.save();
}
