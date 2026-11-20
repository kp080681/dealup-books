'use client';

import { useActionState, startTransition, useMemo, useState } from 'react';
import { issueInvoiceAction } from '../app/invoice-actions';
import { computeInvoice, supplyType, CURRENCIES, GST_RATES } from '../lib/invoices';

const STATES = ['Karnataka', 'Andhra Pradesh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal', 'Other'];
const blank = () => ({ description: '', sac: '998366', qty: '1', rate: '' });
const fmt = (minor, cur) => `${cur} ${(minor / 100).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceForm({ clients, companyState, nextNumber, today, hasLut }) {
  const [state, run, pending] = useActionState(issueInvoiceAction, null);
  const [c, setC] = useState({ client_name: '', client_address: '', client_state: companyState || 'Karnataka', client_country: 'India', client_gstin: '', client_email: '' });
  const [currency, setCurrency] = useState('INR');
  const [gstRate, setGstRate] = useState(18);
  const [waive, setWaive] = useState(false);
  const [items, setItems] = useState([blank()]);

  const type = supplyType({ clientCountry: c.client_country, clientState: c.client_state, companyState });
  const calc = useMemo(() => computeInvoice(items, { type, gstRate, waived: waive }), [items, type, gstRate, waive]);

  const pickClient = (name) => {
    const k = clients.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (k) {
      setC({ client_name: k.name, client_address: k.address, client_state: k.state || companyState, client_country: k.country || 'India', client_gstin: k.gstin, client_email: k.email });
      setCurrency(k.currency || 'INR');
    } else setC({ ...c, client_name: name });
  };
  const setItem = (i, key, v) => setItems(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)));

  return (
    <form className="card form" onSubmit={(ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget);
      fd.set('items', JSON.stringify(items));
      startTransition(() => run(fd));
    }}>
      <p className="mute">This invoice will be <b>{nextNumber}</b> (the next free number, confirmed when you issue it).</p>
      <h2>Client</h2>
      <div className="grid">
        <label>Name
          <input name="client_name" list="client-list" value={c.client_name} onChange={(e) => pickClient(e.target.value)} required autoComplete="off" />
          <datalist id="client-list">{clients.map((k) => <option key={k.id} value={k.name} />)}</datalist>
        </label>
        <label>Country
          <input name="client_country" value={c.client_country} onChange={(e) => setC({ ...c, client_country: e.target.value })} />
        </label>
        {type !== 'export' ? (
          <label>State
            <select name="client_state" value={c.client_state} onChange={(e) => setC({ ...c, client_state: e.target.value })}>
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        ) : null}
        {type !== 'export' ? (
          <label>GSTIN (if registered)<input name="client_gstin" value={c.client_gstin} onChange={(e) => setC({ ...c, client_gstin: e.target.value.toUpperCase() })} maxLength={15} /></label>
        ) : null}
        <label>Email (optional)<input name="client_email" type="email" value={c.client_email} onChange={(e) => setC({ ...c, client_email: e.target.value })} /></label>
      </div>
      <label>Address<textarea name="client_address" rows={2} value={c.client_address} onChange={(e) => setC({ ...c, client_address: e.target.value })} /></label>

      <h2>Invoice</h2>
      <div className="grid">
        <label>Invoice date<input type="date" name="invoice_date" defaultValue={today} max={today} required /></label>
        <label>Due date (optional)<input type="date" name="due_date" /></label>
        <label>Currency
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        {currency !== 'INR' ? <label>Exchange rate to INR (optional)<input name="fx_rate" inputMode="decimal" placeholder="22.90" /></label> : null}
        {type !== 'export' ? (
          <label>GST rate
            <select name="gst_rate" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </label>
        ) : null}
      </div>
      <p className="ask">
        {type === 'intra' ? `Client in ${companyState}: GST split as CGST ${gstRate / 2}% + SGST ${gstRate / 2}%.` : null}
        {type === 'inter' ? `Client in another state: IGST ${gstRate}%.` : null}
        {type === 'export' ? (hasLut ? 'Client outside India: export of services under your LUT, no GST charged.' : 'Client outside India: this needs your LUT number. Add it in Company details first.') : null}
      </p>

      <h2>Items</h2>
      <div className="tablewrap">
        <table className="items">
          <thead><tr><th>Description</th><th>SAC</th><th className="num">Qty</th><th className="num">Rate ({currency})</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="wrap"><input aria-label="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Google Ads management - November 2026" /></td>
                <td><input aria-label="SAC" value={it.sac} onChange={(e) => setItem(i, 'sac', e.target.value)} style={{ width: 90 }} /></td>
                <td><input aria-label="Quantity" value={it.qty} inputMode="decimal" onChange={(e) => setItem(i, 'qty', e.target.value)} style={{ width: 60 }} /></td>
                <td><input aria-label="Rate" value={it.rate} inputMode="decimal" onChange={(e) => setItem(i, 'rate', e.target.value)} style={{ width: 110 }} /></td>
                <td className="num">{fmt(Math.round((Number(it.qty) || 0) * (Number(String(it.rate).replace(/,/g, '')) || 0) * 100), currency)}</td>
                <td>{items.length > 1 ? <button type="button" className="link" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><button type="button" className="link" onClick={() => setItems([...items, blank()])}>+ Add another item</button></p>
      <p className="mute">SAC 998366 is advertising and marketing services; 998381 photography and design; 998314 website design. Check with the CA if unsure.</p>

      {type !== 'export' ? (
        <>
          <label className="check"><input type="checkbox" name="waive" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> <span>No GST on this invoice (the CA will see the reason)</span></label>
          {waive ? <label>Why no GST?<input name="waive_reason" required /></label> : null}
        </>
      ) : null}
      <label>Notes on the invoice (optional)<textarea name="notes" rows={2} placeholder="Thank you for your business." /></label>

      <div className="card totals">
        <div><span>Subtotal</span><b>{fmt(calc.subtotal, currency)}</b></div>
        {calc.cgst ? <div><span>CGST {calc.gstRate / 2}%</span><b>{fmt(calc.cgst, currency)}</b></div> : null}
        {calc.sgst ? <div><span>SGST {calc.gstRate / 2}%</span><b>{fmt(calc.sgst, currency)}</b></div> : null}
        {calc.igst ? <div><span>IGST {calc.gstRate}%</span><b>{fmt(calc.igst, currency)}</b></div> : null}
        <div className="grand"><span>Total</span><b>{fmt(calc.total, currency)}</b></div>
      </div>

      {state?.error ? <p className="error">{state.error}</p> : null}
      <p className="mute">Once issued, an invoice can't be edited. A mistake is fixed by cancelling it with a reason and issuing a new one.</p>
      <button disabled={pending}>{pending ? 'Issuing…' : 'Issue invoice and save PDF'}</button>
    </form>
  );
}
