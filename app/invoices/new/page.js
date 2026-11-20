import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../lib/auth';
import { q } from '../../../lib/db';
import { getCompany } from '../../../lib/books';
import { todayIST } from '../../../lib/parse';
import { fyOf } from '../../../lib/compliance';
import { formatNumber, nextSeq } from '../../../lib/invoices';
import InvoiceForm from '../../../components/InvoiceForm';

export const dynamic = 'force-dynamic';

export default async function NewInvoice() {
  const user = await requireUser();
  if (user.role !== 'owner') redirect('/invoices');
  const { profile: co } = await getCompany();
  const today = todayIST();
  const fy = fyOf(today);
  const prefix = co.invoice_prefix || 'DU/INV';
  const numbers = (await q('select number from invoices where fy = $1', [fy])).rows.map((r) => r.number);
  const clients = (await q('select id, name, address, state, country, gstin, email, currency from clients order by lower(name)')).rows;
  const missing = ['gstin', 'address', 'bank_account', 'bank_ifsc'].filter((k) => !co[k]);
  return (
    <>
      <p><Link href="/invoices">← Invoices</Link></p>
      <h1>New invoice</h1>
      {numbers.length === 0 ? (
        <p className="ask">No invoices for this financial year are in DealUp Books yet, so this one would be number 001. If you've already sent invoices this year, <Link href="/invoices/upload">add them first</Link> so the numbering carries on from the last one.</p>
      ) : null}
      {missing.length ? (
        <p className="ask">Your invoices will be missing some details ({missing.join(', ').replace(/_/g, ' ')}). <Link href="/company">Add them in Company details</Link> first.</p>
      ) : null}
      <InvoiceForm clients={clients} companyState={co.state} nextNumber={formatNumber(prefix, fy, nextSeq(numbers, prefix, fy))} today={today} hasLut={Boolean(co.lut_number)} />
    </>
  );
}
