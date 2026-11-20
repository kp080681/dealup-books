import Link from 'next/link';
import { requireUser } from '../../lib/auth';
import { q } from '../../lib/db';
import { getCompany } from '../../lib/books';
import { todayIST } from '../../lib/parse';
import { fyOf, fyLabel } from '../../lib/compliance';
import { niceDate, niceMonth } from '../../lib/format';
import { fmtMoney, formatNumber, nextSeq } from '../../lib/invoices';
import SimpleForm from '../../components/SimpleForm';
import { cancelInvoiceAction } from '../invoice-actions';

export const dynamic = 'force-dynamic';

const TYPE = { intra: 'CGST + SGST', inter: 'IGST', export: 'Export (LUT)' };

export default async function Invoices({ searchParams }) {
  const user = await requireUser();
  const owner = user.role === 'owner';
  const sp = await searchParams;
  const cur = fyOf(todayIST());
  const fy = /^20\d\d$/.test(sp.fy || '') ? Number(sp.fy) : cur;
  const { profile: co } = await getCompany();
  const rows = (await q(
    `select i.*, to_char(i.invoice_date, 'YYYY-MM-DD') as d from invoices i where i.fy = $1 order by i.invoice_date desc, i.id desc`, [fy])).rows;
  const issued = Number(sp.issued) ? rows.find((r) => r.id === Number(sp.issued)) : null;
  const prefix = co.invoice_prefix || 'DU/INV';
  const next = formatNumber(prefix, cur, nextSeq((await q('select number from invoices where fy = $1', [cur])).rows.map((r) => r.number), prefix, cur));

  const byMonth = {};
  for (const r of rows) (byMonth[r.d.slice(0, 7)] ||= []).push(r);
  const live = rows.filter((r) => r.status === 'issued');
  const totalsByCur = {};
  for (const r of live) totalsByCur[r.currency] = (totalsByCur[r.currency] || 0) + Number(r.total_minor);
  const counts = {};
  for (const r of rows) counts[r.number.toLowerCase()] = (counts[r.number.toLowerCase()] || 0) + 1;

  return (
    <>
      <h1>Invoices, {fyLabel(fy)}</h1>
      <nav className="tabs">
        {[cur - 1, cur].map((y) => <Link key={y} className={`tab${y === fy ? ' on' : ''}`} href={`/invoices?fy=${y}`}>{fyLabel(y)}</Link>)}
      </nav>
      {issued ? (
        <p className="ok">Invoice {issued.number} issued. <a href={`/api/documents/${issued.document_id}`}>Download the PDF</a> and send it to the client.</p>
      ) : null}
      <div className="filters card">
        {owner ? <Link className="button" href="/invoices/new">New invoice</Link> : null}
        {owner ? <Link href="/invoices/upload">Add an invoice made elsewhere</Link> : null}
        <a href={`/api/invoices/register?fy=${fy}`}>Download register (CSV)</a>
        <span className="mute">Next number: {next}</span>
      </div>
      <div className="stats">
        <div className="stat">Invoices issued<b>{live.length}</b></div>
        {Object.entries(totalsByCur).map(([c, t]) => <div key={c} className="stat">Billed in {c}<b>{fmtMoney(t, c)}</b></div>)}
      </div>

      {rows.length === 0 ? <p className="mute">No invoices for {fyLabel(fy)} yet.</p> : null}
      {Object.entries(byMonth).map(([m, list]) => (
        <section key={m}>
          <h2>{niceMonth(m)}</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Number</th><th>Date</th><th>Client</th><th>GST</th><th className="num">Total</th><th>PDF</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={r.status === 'cancelled' ? 'old' : ''}>
                    <td>
                      {r.number}
                      {counts[r.number.toLowerCase()] > 1 ? <span className="pill flag" title="This number is on more than one invoice"> used twice</span> : null}
                      {r.source === 'uploaded' ? <span className="pill"> added</span> : null}
                    </td>
                    <td>{niceDate(r.d)}</td>
                    <td className="wrap">{r.client_name}</td>
                    <td>{TYPE[r.supply_type]}{r.gst_waived_reason ? ' (none)' : ''}</td>
                    <td className="num">{fmtMoney(r.total_minor, r.currency)}</td>
                    <td>{r.document_id ? <a href={`/api/documents/${r.document_id}`}>Download</a> : ''}</td>
                    <td>
                      {r.status === 'cancelled' ? <span className="pill">cancelled: {r.cancel_reason}</span> : owner ? (
                        <details>
                          <summary className="mute">Cancel</summary>
                          <SimpleForm action={cancelInvoiceAction} button="Cancel invoice" className="form sub">
                            <input type="hidden" name="id" value={r.id} />
                            <label>Why?<input name="reason" required placeholder="Wrong amount; reissued as the next number" /></label>
                          </SimpleForm>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
