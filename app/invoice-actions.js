'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx } from '../lib/db';
import { requireOwner } from '../lib/auth';
import { getCompany } from '../lib/books';
import { todayIST } from '../lib/parse';
import { readUpload } from '../lib/documents';
import { fyOf } from '../lib/compliance';
import { CURRENCIES, GST_RATES, computeInvoice, formatNumber, nextSeq, supplyType, toMinor } from '../lib/invoices';
import { buildInvoicePdf } from '../lib/invoice-pdf';

const str = (fd, k, max = 300) => String(fd.get(k) ?? '').trim().slice(0, max);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function readClient(fd) {
  return {
    name: str(fd, 'client_name', 150),
    address: str(fd, 'client_address', 400),
    state: str(fd, 'client_state', 60),
    country: str(fd, 'client_country', 60) || 'India',
    gstin: str(fd, 'client_gstin', 15).toUpperCase(),
    email: str(fd, 'client_email', 150).toLowerCase(),
  };
}

async function saveClient(db, c, currency) {
  const r = await db.query(
    `insert into clients (name, address, state, country, gstin, email, currency) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (lower(name)) do update set address = excluded.address, state = excluded.state, country = excluded.country,
       gstin = excluded.gstin, email = case when excluded.email <> '' then excluded.email else clients.email end,
       currency = excluded.currency, updated_at = now()
     returning id`,
    [c.name, c.address, c.state, c.country, c.gstin, c.email, currency]);
  return r.rows[0].id;
}

// ---------- Create and issue an invoice ----------

export async function issueInvoiceAction(_prev, fd) {
  const user = await requireOwner();
  const { profile: co } = await getCompany();
  const client = readClient(fd);
  if (!client.name) return { error: "Enter the client's name." };
  if (client.gstin && !GSTIN_RE.test(client.gstin)) return { error: "The client's GSTIN should be 15 characters, like 29ABCDE1234F1Z5." };
  const type = supplyType({ clientCountry: client.country, clientState: client.state, companyState: co.state });
  if (type !== 'export' && !client.state) return { error: "Choose the client's state. It decides whether GST is CGST + SGST or IGST." };
  if (type === 'export' && !co.lut_number) return { error: 'This client is outside India, so the invoice goes out under your LUT. Add the LUT number in Company details first.' };

  const invoiceDate = str(fd, 'invoice_date', 10);
  const dueDate = str(fd, 'due_date', 10);
  if (!isDate(invoiceDate)) return { error: 'Enter the invoice date.' };
  if (invoiceDate > todayIST()) return { error: "The invoice date can't be in the future." };
  if (dueDate && (!isDate(dueDate) || dueDate < invoiceDate)) return { error: 'The due date must be on or after the invoice date.' };

  const currency = CURRENCIES.includes(str(fd, 'currency', 3)) ? str(fd, 'currency', 3) : 'INR';
  const fxRaw = str(fd, 'fx_rate', 12);
  const fx = currency !== 'INR' && fxRaw ? Number(fxRaw) : null;
  if (fx !== null && !(fx > 0)) return { error: 'The exchange rate should be a number, for example 22.90.' };

  let items;
  try { items = JSON.parse(String(fd.get('items') || '[]')); } catch { items = []; }
  if (!Array.isArray(items)) items = [];
  items = items.slice(0, 40);
  const gstRate = GST_RATES.includes(Number(fd.get('gst_rate'))) ? Number(fd.get('gst_rate')) : 18;
  const waived = type !== 'export' && fd.get('waive') === 'on';
  const waiveReason = waived ? str(fd, 'waive_reason', 200) : '';
  if (waived && !waiveReason) return { error: 'Say why no GST is charged. The CA will see it.' };
  const calc = computeInvoice(items, { type, gstRate, waived });
  if (!calc.lines.length) return { error: 'Add at least one item with a description, quantity and rate.' };
  if (calc.total <= 0) return { error: 'The invoice total must be more than zero.' };
  const notes = str(fd, 'notes', 800);
  const fy = fyOf(invoiceDate);
  const prefix = co.invoice_prefix || 'DU/INV';

  const id = await tx(async (db) => {
    // One invoice at a time gets a number, so two can never share one.
    await db.query('select pg_advisory_xact_lock(424242)');
    const existing = (await db.query('select number from invoices where fy = $1', [fy])).rows.map((r) => r.number);
    const number = formatNumber(prefix, fy, nextSeq(existing, prefix, fy));
    const clientId = await saveClient(db, client, currency);
    const inv = {
      number, invoice_date: invoiceDate, due_date: dueDate || null, supply_type: type, currency, fx_rate: fx,
      gst_rate: calc.gstRate, gst_waived_reason: waiveReason, items: calc.lines,
      subtotal_minor: calc.subtotal, cgst_minor: calc.cgst, sgst_minor: calc.sgst, igst_minor: calc.igst, total_minor: calc.total,
      notes, client_name: client.name, client_address: client.address, client_state: type === 'export' ? '' : client.state,
      client_country: client.country, client_gstin: client.gstin,
    };
    const bytes = Buffer.from(await buildInvoicePdf(inv, co));
    const filename = `${number.replace(/\//g, '-')} ${client.name}`.replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) + '.pdf';
    const doc = await db.query(
      `insert into documents (doc_type, title, filename, mime, size_bytes, sha256, content, fy, uploaded_by)
       values ('Sales invoice', $1, $2, 'application/pdf', $3, $4, $5, $6, $7) returning id`,
      [`${number} ${client.name}`, filename, bytes.length, crypto.createHash('sha256').update(bytes).digest('hex'), bytes, fy, user.id]);
    const r = await db.query(
      `insert into invoices (number, fy, source, invoice_date, due_date, client_id, client_name, client_address, client_state, client_country,
         client_gstin, supply_type, currency, fx_rate, gst_rate, gst_waived_reason, items, subtotal_minor, cgst_minor, sgst_minor, igst_minor,
         total_minor, notes, document_id, created_by)
       values ($1,$2,'generated',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
      [number, fy, invoiceDate, inv.due_date, clientId, client.name, client.address, inv.client_state, client.country, client.gstin,
        type, currency, fx, calc.gstRate, waiveReason, JSON.stringify(calc.lines), calc.subtotal, calc.cgst, calc.sgst, calc.igst,
        calc.total, notes, doc.rows[0].id, user.id]);
    return r.rows[0].id;
  });
  revalidatePath('/invoices');
  redirect(`/invoices?fy=${fy}&issued=${id}`);
}

// ---------- Upload an invoice made elsewhere ----------

export async function uploadInvoiceAction(_prev, fd) {
  const user = await requireOwner();
  const number = str(fd, 'number', 40);
  const invoiceDate = str(fd, 'invoice_date', 10);
  const client = readClient(fd);
  if (!number) return { error: 'Enter the invoice number exactly as printed on it.' };
  if (!isDate(invoiceDate) || invoiceDate > todayIST()) return { error: 'Enter the invoice date (today or earlier).' };
  if (!client.name) return { error: "Enter the client's name." };
  const currency = CURRENCIES.includes(str(fd, 'currency', 3)) ? str(fd, 'currency', 3) : 'INR';
  const gstType = str(fd, 'gst_type', 10);
  const type = gstType === 'export' ? 'export' : gstType === 'igst' ? 'inter' : 'intra';
  const taxable = toMinor(str(fd, 'taxable', 20) || '0');
  const gst = toMinor(str(fd, 'gst', 20) || '0');
  if (!(taxable > 0)) return { error: 'Enter the amount before GST.' };
  if (!(gst >= 0)) return { error: 'Enter the GST amount, or 0.' };
  const fy = fyOf(invoiceDate);
  const dup = (await q('select client_name from invoices where lower(number) = lower($1)', [number])).rows[0];
  if (dup && fd.get('allow_duplicate') !== 'on') {
    return { error: `Invoice ${number} is already in the register (${dup.client_name}). If this really is a second invoice with the same number, tick "This number was used twice" and upload again. The CA will see it flagged.` };
  }
  const up = await readUpload(fd.get('file'));
  if (up.error) return up;
  const half = Math.round(gst / 2);
  const cgst = type === 'intra' ? half : 0;
  const sgst = type === 'intra' ? gst - half : 0;
  const igst = type === 'inter' ? gst : 0;
  const notes = [str(fd, 'notes', 500), dup ? `Same invoice number as another invoice (${dup.client_name}). CA to advise.` : ''].filter(Boolean).join(' ');
  await tx(async (db) => {
    const clientId = await saveClient(db, client, currency);
    const doc = await db.query(
      `insert into documents (doc_type, title, filename, mime, size_bytes, sha256, content, fy, uploaded_by)
       values ('Sales invoice', $1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [`${number} ${client.name}`, up.filename, up.mime, up.bytes.length, up.sha256, up.bytes, fy, user.id]);
    await db.query(
      `insert into invoices (number, fy, source, invoice_date, client_id, client_name, client_address, client_state, client_country, client_gstin,
         supply_type, currency, gst_rate, subtotal_minor, cgst_minor, sgst_minor, igst_minor, total_minor, notes, document_id, created_by)
       values ($1,$2,'uploaded',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [number, fy, invoiceDate, clientId, client.name, client.address, client.state, client.country, client.gstin, type, currency,
        taxable ? Math.round((gst / taxable) * 10000) / 100 : 0, taxable, cgst, sgst, igst, taxable + gst, notes, doc.rows[0].id, user.id]);
  });
  revalidatePath('/invoices');
  return { ok: `Invoice ${number} added to ${fy}-${String(fy + 1).slice(2)}.`, at: Date.now() };
}

// ---------- Cancel ----------

export async function cancelInvoiceAction(_prev, fd) {
  const user = await requireOwner();
  const id = Number(fd.get('id'));
  const reason = str(fd, 'reason', 300);
  if (!reason) return { error: 'Say why the invoice is cancelled.' };
  const r = await q(
    `update invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3
     where id = $1 and status = 'issued' returning number`, [id, user.id, reason]);
  if (!r.rows[0]) return { error: 'That invoice is already cancelled.' };
  revalidatePath('/invoices');
  return { ok: `Invoice ${r.rows[0].number} cancelled. Its number stays used.` };
}
