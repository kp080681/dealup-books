import { niceDate, rupees, niceMonth } from '../lib/format';
import { standing, daysBetween } from '../lib/compliance';
import SimpleForm from './SimpleForm';
import { markDoneAction, undoDoneAction, changeDueAction } from '../app/books-actions';

function whenText(i, today, past) {
  const d = daysBetween(today, i.due);
  if (i.done_on) return `Done ${niceDate(i.done_on)}`;
  if (past) return 'Not tracked';
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `In ${d} days`;
}

export default function ComplianceItem({ item: i, today, owner, tds, past = false }) {
  const s = past ? 'past' : standing(i, today);
  return (
    <div className={`card item ${s}`}>
      <div className="itemhead">
        <div>
          <strong>{i.title}</strong>
          <div className="mute">
            Due {niceDate(i.due)} · {i.owner === 'ca' ? 'CA files it' : 'You do it'} · {i.area}{i.optional ? ' · may not apply' : ''}
          </div>
          {i.due_override ? <div className="mute">Date changed from {niceDate(i.standard_due)}: {i.due_reason}</div> : null}
        </div>
        <span className={`pill ${s}`}>{whenText(i, today, past)}</span>
      </div>

      {tds && tds.length ? (
        <div className="ask">
          Payments in {niceMonth(i.tdsMonth)} that may need TDS:{' '}
          {tds.map((t) => `${t.party || 'unnamed'} ${rupees(t.total)}`).join(', ')}. The CA decides whether TDS applies.
        </div>
      ) : null}

      {i.done_on ? (
        <p className="mute">
          Done on {niceDate(i.done_on)}{i.done_by ? ` by ${i.done_by}` : ''}{i.done_note ? `. ${i.done_note}` : ''}
          {i.document_id ? <> · <a href={`/api/documents/${i.document_id}`}>Proof</a></> : ' · No proof uploaded'}
        </p>
      ) : null}

      <details>
        <summary>What is this{owner ? ' / mark done' : ''}</summary>
        <p>{i.plain}</p>
        {owner && !i.done_on ? (
          <>
            <SimpleForm action={markDoneAction} button="Mark done" className="form sub">
              <input type="hidden" name="key" value={i.key} />
              <div className="grid">
                <label>Done on<input type="date" name="done_on" defaultValue={today} max={today} required /></label>
                <label>Note (optional)<input name="note" placeholder="For example: challan number, or 'no TDS this month'" /></label>
              </div>
              <label>Proof: challan, acknowledgement or screenshot (optional, PDF/PNG/JPG up to 5 MB)
                <input type="file" name="proof" accept="application/pdf,image/png,image/jpeg" />
              </label>
              <input type="hidden" name="title" value={`${i.title} — proof`} />
            </SimpleForm>
            <SimpleForm action={changeDueAction} button="Change due date" className="form sub">
              <input type="hidden" name="key" value={i.key} />
              <div className="grid">
                <label>New due date<input type="date" name="due_on" defaultValue={i.due} required /></label>
                <label>Why<input name="reason" placeholder="For example: extended by CBDT to 10 December" required /></label>
              </div>
            </SimpleForm>
          </>
        ) : null}
        {owner && i.done_on ? (
          <form action={undoDoneAction}><input type="hidden" name="key" value={i.key} /><button className="link">Mark as not done</button></form>
        ) : null}
      </details>
    </div>
  );
}
