import { requireUser } from '../../lib/auth';
import { getCompany } from '../../lib/books';
import SimpleForm from '../../components/SimpleForm';
import { saveCompanyAction } from '../books-actions';

export const dynamic = 'force-dynamic';

const STATES = ['Andhra Pradesh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal', 'Other'];

function Check({ name, on, children }) {
  return (
    <label className="check"><input type="checkbox" name={name} defaultChecked={on} /> <span>{children}</span></label>
  );
}

export default async function Company() {
  const user = await requireUser();
  const { profile: p, saved } = await getCompany();
  const ro = user.role !== 'owner';
  const body = (
    <fieldset disabled={ro}>
      <h2>The company</h2>
      <div className="grid">
        <label>Legal name<input name="legal_name" defaultValue={p.legal_name} placeholder="DealUp Strategies Private Limited" /></label>
        <label>CIN<input name="cin" defaultValue={p.cin} /></label>
        <label>PAN<input name="pan" defaultValue={p.pan} /></label>
        <label>TAN<input name="tan" defaultValue={p.tan} /></label>
        <label>GSTIN<input name="gstin" defaultValue={p.gstin} /></label>
        <label>State
          <select name="state" defaultValue={p.state}>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label>Date of incorporation<input type="date" name="incorporation_date" defaultValue={p.incorporation_date} /></label>
        <label>End of the first financial year<input type="date" name="first_fy_end" defaultValue={p.first_fy_end} /></label>
      </div>
      <label>Registered address<textarea name="address" rows={2} defaultValue={p.address} /></label>

      <h2>What applies to the company</h2>
      <p className="mute">These decide what shows on the compliance calendar. If you are not sure about one, ask the CA.</p>
      <Check name="small_company" on={p.small_company}>It's a small company (paid-up capital up to ₹4 crore and turnover up to ₹40 crore)</Check>
      <Check name="gst_registered" on={p.gst_registered}>Registered for GST</Check>
      <label>GST returns
        <select name="gst_scheme" defaultValue={p.gst_scheme}>
          <option value="monthly">Monthly</option>
          <option value="qrmp">Quarterly (QRMP scheme)</option>
        </select>
      </label>
      <Check name="exports_lut" on={p.exports_lut}>Invoices clients outside India without GST, under an LUT</Check>
      <Check name="deducts_tds" on={p.deducts_tds}>Has a TAN and deducts TDS (on contractors, professionals or rent)</Check>
      <Check name="pt_registered" on={p.pt_registered}>Registered for professional tax as an employer</Check>
      <Check name="director_loans" on={p.director_loans}>Has money lent by a director (needs DPT-3 each year)</Check>
      <Check name="msme_vendors" on={p.msme_vendors}>Buys from MSME-registered suppliers</Check>
      <Check name="advance_tax" on={p.advance_tax}>Expects to pay income tax this year (advance tax)</Check>
      <label>Director KYC was last filed in the financial year starting (for example 2025)
        <input name="dir_kyc_last_fy" defaultValue={p.dir_kyc_last_fy} inputMode="numeric" maxLength={4} />
      </label>

      <h2>Reminders</h2>
      <div className="grid">
        <label>CA's name<input name="ca_name" defaultValue={p.ca_name} /></label>
        <label>CA's email (gets reminders for the items marked CA)<input type="email" name="ca_email" defaultValue={p.ca_email} /></label>
      </div>
      <label>Other emails for reminders, separated by commas (your login email always gets them)
        <input name="reminder_emails" defaultValue={p.reminder_emails} />
      </label>
      <label>Start reminders from (anything due before this date is treated as past)
        <input type="date" name="tracking_from" defaultValue={p.tracking_from} />
      </label>
    </fieldset>
  );
  return (
    <>
      <h1>Company details</h1>
      {!saved && !ro ? <p className="ask">Fill these in once. The compliance calendar is built from them.</p> : null}
      {ro ? <div className="card form">{body}</div> : <SimpleForm action={saveCompanyAction} button="Save company details">{body}</SimpleForm>}
    </>
  );
}
