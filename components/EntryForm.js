'use client';

import { useActionState, startTransition } from 'react';
import { saveEntryAction } from '../app/actions';

export default function EntryForm({ initial, accounts, categories, correctsId, submitLabel = 'Confirm and save', onSaved }) {
  const [state, action, pending] = useActionState(async (prev, fd) => {
    const res = await saveEntryAction(prev, fd);
    if (res?.ok && onSaved) onSaved(res);
    return res;
  }, null);
  const v = initial || {};
  return (
    <form className="card form" onSubmit={(ev) => {
      // No automatic reset: on an error the row stays as typed.
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget);
      startTransition(() => action(fd));
    }}>
      {correctsId ? <input type="hidden" name="corrects_id" value={correctsId} /> : null}
      <input type="hidden" name="source_text" value={v.source_text || ''} />
      <input type="hidden" name="source_type" value={v.source_type || 'form'} />
      <div className="grid">
        <label>Paid or received
          <select name="direction" defaultValue={v.direction || ''} required>
            <option value="" disabled>Choose</option>
            <option value="paid">Paid out</option>
            <option value="received">Received</option>
          </select>
        </label>
        <label>Amount (₹)
          <input name="amount" inputMode="decimal" defaultValue={v.amount || ''} placeholder="20000" required />
        </label>
        <label>Date
          <input type="date" name="entry_date" defaultValue={v.entry_date || ''} required />
        </label>
        <label>Account
          <select name="account" defaultValue={v.account || ''} required>
            <option value="" disabled>Choose</option>
            {accounts.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label>Party (who was paid / who paid)
          <input name="party" defaultValue={v.party || ''} />
        </label>
        <label>Category
          <select name="category" defaultValue={v.category || 'Uncategorised'}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Client (if it relates to one)
          <input name="client" defaultValue={v.client || ''} />
        </label>
        <label>Month the work relates to
          <input type="month" name="period_month" defaultValue={v.period_month || ''} />
        </label>
      </div>
      <label>Note
        <input name="note" defaultValue={v.note || ''} />
      </label>
      <label>Questions for the CA <span className="hint">(the agent never decides tax treatment)</span>
        <textarea name="ca_flags" rows={2} defaultValue={v.ca_flags || ''} />
      </label>
      {correctsId ? (
        <label>Why is this being corrected?
          <input name="reason" required placeholder="For example: wrong amount typed" />
        </label>
      ) : null}
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
