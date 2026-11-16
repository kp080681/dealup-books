import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '../../../lib/auth';
import { q } from '../../../lib/db';
import { ACCOUNTS, CATEGORIES } from '../../../lib/parse';
import { rupees, niceDate, niceMonth } from '../../../lib/format';
import EntryForm from '../../../components/EntryForm';
import SimpleForm from '../../../components/SimpleForm';
import { voidEntryAction } from '../../actions';

export const dynamic = 'force-dynamic';

const SOURCE = { message: 'Typed message', form: 'Form', import: 'Imported file', statement: 'Bank statement', invoice: 'Invoice' };

export default async function EntryPage({ params }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const e = (await q(
    `select e.*, u.name as by_name, to_char(e.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') as made
     from entries e left join users u on u.id = e.created_by where e.id = $1`, [id])).rows[0];
  if (!e) notFound();
  const next = (await q('select id, kind, reason from entries where corrects_id = $1', [id])).rows[0];
  const active = e.kind !== 'void' && !next;

  return (
    <>
      <p><Link href="/">← Ledger</Link></p>
      <h1>Entry #{e.id} {e.kind === 'void' ? '(cancellation)' : e.kind === 'correction' ? '(correction)' : ''}</h1>

      {e.corrects_id ? (
        <p className="ask">
          {e.kind === 'void' ? 'Cancels' : 'Replaces'} <Link href={`/entry/${e.corrects_id}`}>entry #{e.corrects_id}</Link>. Reason: {e.reason}
        </p>
      ) : null}
      {next ? (
        <p className="ask">
          This entry was {next.kind === 'void' ? 'cancelled' : 'corrected'} by <Link href={`/entry/${next.id}`}>entry #{next.id}</Link>. Reason: {next.reason}
        </p>
      ) : null}

      <div className="card">
        <dl>
          <dt>Date</dt><dd>{niceDate(e.entry_date)}</dd>
          <dt>Type</dt><dd>{e.direction === 'received' ? 'Received' : 'Paid out'}</dd>
          <dt>Amount</dt><dd>{rupees(e.amount_paise)}</dd>
          <dt>Account</dt><dd>{e.account}</dd>
          <dt>Party</dt><dd>{e.party || '—'}</dd>
          <dt>Category</dt><dd>{e.category}</dd>
          <dt>Client</dt><dd>{e.client || '—'}</dd>
          <dt>Work month</dt><dd>{niceMonth(e.period_month) || '—'}</dd>
          <dt>Note</dt><dd>{e.note || '—'}</dd>
          <dt>For the CA</dt><dd style={{ whiteSpace: 'pre-line' }}>{e.ca_flags || '—'}</dd>
          <dt>Source</dt><dd>{SOURCE[e.source_type]}{e.source_text ? `: “${e.source_text}”` : ''}</dd>
          <dt>Recorded</dt><dd>{e.made} IST{e.by_name ? ` by ${e.by_name}` : ''}</dd>
        </dl>
      </div>

      {user.role === 'owner' && active ? (
        <>
          <h2>Correct this entry</h2>
          <p className="mute">The old entry stays on record. A new entry replaces it, with your reason.</p>
          <EntryForm accounts={ACCOUNTS} categories={CATEGORIES} correctsId={e.id} submitLabel="Save correction"
            initial={{ ...e, amount: String(Number(e.amount_paise) / 100) }} />

          <h2>Cancel this entry</h2>
          <SimpleForm action={voidEntryAction} button="Cancel entry">
            <input type="hidden" name="id" value={e.id} />
            <label>Why is this being cancelled?
              <input name="reason" required placeholder="For example: entered twice" />
            </label>
          </SimpleForm>
        </>
      ) : null}
    </>
  );
}
