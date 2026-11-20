import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../lib/auth';
import { todayIST } from '../../../lib/parse';
import { CURRENCIES } from '../../../lib/invoices';
import SimpleForm from '../../../components/SimpleForm';
import { uploadInvoiceAction } from '../../invoice-actions';

export const dynamic = 'force-dynamic';

export default async function UploadInvoice() {
  const user = await requireUser();
  if (user.role !== 'owner') redirect('/invoices');
  return (
    <>
      <p><Link href="/invoices">← Invoices</Link></p>
      <h1>Add an invoice made elsewhere</h1>
      <p className="mute">For invoices you already sent from Zoho, Word or anywhere else. Type the details exactly as printed and attach the PDF. It goes into the register for its month.</p>
      <SimpleForm action={uploadInvoiceAction} button="Add to register" reset>
        <div className="grid">
          <label>Invoice number<input name="number" required placeholder="DU/INV/2026-27/005" /></label>
          <label>Invoice date<input type="date" name="invoice_date" max={todayIST()} required /></label>
          <label>Client name<input name="client_name" required /></label>
          <label>Client country<input name="client_country" defaultValue="India" /></label>
          <label>Client state (India only)<input name="client_state" defaultValue="Karnataka" /></label>
          <label>Client GSTIN (if any)<input name="client_gstin" maxLength={15} /></label>
          <label>Currency
            <select name="currency" defaultValue="INR">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>GST on the invoice
            <select name="gst_type" defaultValue="cgst">
              <option value="cgst">CGST + SGST (Karnataka client)</option>
              <option value="igst">IGST (other state)</option>
              <option value="export">None: export under LUT</option>
            </select>
          </label>
          <label>Amount before GST<input name="taxable" inputMode="decimal" required placeholder="15000" /></label>
          <label>GST amount (0 if none)<input name="gst" inputMode="decimal" defaultValue="0" /></label>
        </div>
        <label>Note (optional)<input name="notes" /></label>
        <label>The invoice (PDF or photo, up to 5 MB)<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
        <label className="check"><input type="checkbox" name="allow_duplicate" /> <span>This number was used twice (only tick this if the app says the number already exists)</span></label>
      </SimpleForm>
    </>
  );
}
