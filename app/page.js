import Link from 'next/link';
import { requireUser } from '../lib/auth';
import { q, ACTIVE } from '../lib/db';
import { ACCOUNTS, CATEGORIES, todayIST } from '../lib/parse';
import { rupees, niceDate, niceMonth } from '../lib/format';
import EntryBox from '../components/EntryBox';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIST();
  const month = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month : '';
  const account = ACCOUNTS.includes(sp.account) ? sp.account : '';
  const flagged = sp.flagged === '1';
  const history = sp.history === '1';

  const where = [history ? 'true' : ACTIVE];
  const params = [];
  if (month) { params.push(month); where.push(`to_char(e.entry_date, 'YYYY-MM') = $${params.length}`); }
  if (account) { params.push(account); where.push(`e.account = $${params.length}`); }
  if (flagged) where.push(`e.ca_flags <> ''`);

  const rows = (await q(
    `select e.*, (${ACTIVE}) as active from entries e where ${where.join(' and ')}
     order by e.entry_date desc, e.id desc limit 300`, params)).rows;

  const thisMonth = today.slice(0, 7);
  const sums = (await q(
    `select e.account, e.direction, sum(e.amount_paise)::bigint as total from entries e
     where ${ACTIVE} and to_char(e.entry_date, 'YYYY-MM') = $1 group by 1, 2`, [thisMonth])).rows;
  const sum = (dir) => sums.filter((s) => s.direction === dir).reduce((a, s) => a + Number(s.total), 0);
  const openFlags = (await q(`select count(*)::int as n from entries e where ${ACTIVE} and e.ca_flags <> ''`)).rows[0].n;

  const exportQs = new URLSearchParams({ ...(month && { month }), ...(account && { account }), ...(flagged && { flagged: '1' }), ...(history && { history: '1' }) }).toString();

  return (
    <>
      {user.role === 'owner' ? (
        <>
          <h1>New entry</h1>
          <EntryBox accounts={ACCOUNTS} categories={CATEGORIES} today={today} />
        </>
      ) : <h1>DealUp Strategies — ledger (read-only)</h1>}

      <h2>{niceMonth(thisMonth)} so far</h2>
      <div className="stats">
        <div className="stat">Received<b>{rupees(sum('received'))}</b></div>
        <div className="stat">Paid out<b>{rupees(sum('paid'))}</b></div>
        <div className="stat">Questions for the CA<b>{openFlags}</b></div>
      </div>

      <h2>Ledger</h2>
      <form className="card filters" method="get">
        <label>Month<input type="month" name="month" defaultValue={month} /></label>
        <label>Account
          <select name="account" defaultValue={account}>
            <option value="">All</option>
            {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label><input type="checkbox" name="flagged" value="1" defaultChecked={flagged} style={{ display: 'inline', width: 'auto' }} /> Only CA questions</label>
        <label><input type="checkbox" name="history" value="1" defaultChecked={history} style={{ display: 'inline', width: 'auto' }} /> Show corrected and cancelled</label>
        <button>Show</button>
        <a href={`/api/export${exportQs ? '?' + exportQs : ''}`}>Download CSV</a>
      </form>

      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>#</th><th>Date</th><th></th><th className="num">Amount</th><th>Account</th><th>Party</th><th>Category</th><th>Client</th><th>For</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={10} className="mute">No entries yet.</td></tr> : null}
            {rows.map((e) => (
              <tr key={e.id} className={e.active ? '' : 'old'}>
                <td><Link href={`/entry/${e.id}`}>{e.id}</Link></td>
                <td>{niceDate(e.entry_date)}</td>
                <td><span className={`pill ${e.direction === 'received' ? 'in' : 'out'}`}>{e.direction === 'received' ? 'In' : 'Out'}</span></td>
                <td className="num">{rupees(e.amount_paise)}</td>
                <td>{e.account}</td>
                <td>{e.party}</td>
                <td>{e.category}</td>
                <td>{e.client}</td>
                <td>{niceMonth(e.period_month)}</td>
                <td>
                  {e.kind === 'void' ? <span className="pill">cancelled</span> : null}
                  {e.kind === 'correction' ? <span className="pill">correction</span> : null}
                  {e.ca_flags && e.active ? <span className="pill flag">CA</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 300 ? <p className="mute">Showing the latest 300. Use the filters or download the CSV for everything.</p> : null}
    </>
  );
}
