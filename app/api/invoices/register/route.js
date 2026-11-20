import { getUser } from '../../../../lib/auth';
import { q } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
const m = (x) => (Number(x) / 100).toFixed(2);

// The sales register for one financial year, for the CA's GST work.
export async function GET(req) {
  const user = await getUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  const fyRaw = new URL(req.url).searchParams.get('fy') || '';
  if (!/^20\d\d$/.test(fyRaw)) return new Response('Choose a financial year.', { status: 400 });
  const fy = Number(fyRaw);
  const rows = (await q(`select *, to_char(invoice_date, 'YYYY-MM-DD') as d from invoices where fy = $1 order by invoice_date, id`, [fy])).rows;
  const head = ['Invoice number', 'Date', 'Client', 'Client GSTIN', 'Client state', 'Client country', 'Type', 'Currency', 'Exchange rate',
    'Taxable value', 'GST rate %', 'CGST', 'SGST', 'IGST', 'Total', 'Total in INR (approx.)', 'Status', 'Cancel reason', 'How it was made', 'Note'];
  const lines = [head.map(cell).join(',')];
  for (const r of rows) {
    const inr = r.currency === 'INR' ? m(r.total_minor) : r.fx_rate ? (Number(r.total_minor) / 100 * Number(r.fx_rate)).toFixed(2) : '';
    lines.push([r.number, r.d, r.client_name, r.client_gstin, r.client_state, r.client_country,
      { intra: 'Within Karnataka (CGST+SGST)', inter: 'Other state (IGST)', export: 'Export under LUT' }[r.supply_type],
      r.currency, r.fx_rate ?? '', m(r.subtotal_minor), Number(r.gst_rate), m(r.cgst_minor), m(r.sgst_minor), m(r.igst_minor), m(r.total_minor), inr,
      r.status === 'cancelled' ? 'Cancelled' : 'Issued', r.cancel_reason, r.source === 'generated' ? 'Created in DealUp Books' : 'Added from elsewhere',
      [r.gst_waived_reason && `No GST: ${r.gst_waived_reason}`, r.notes].filter(Boolean).join(' ')].map(cell).join(','));
  }
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="dealup-invoices-FY${fy}-${String(fy + 1).slice(2)}.csv"`, 'Cache-Control': 'no-store' },
  });
}
