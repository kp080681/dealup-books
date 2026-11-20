import Link from 'next/link';
import { requireUser } from '../../lib/auth';
import { calendarForFy, getCompany, tdsWatch } from '../../lib/books';
import { fyOf, fyLabel, standing } from '../../lib/compliance';
import { todayIST } from '../../lib/parse';
import { niceMonth } from '../../lib/format';
import ComplianceItem from '../../components/ComplianceItem';

export const dynamic = 'force-dynamic';

export default async function Compliance({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIST();
  const cur = fyOf(today);
  const fy = /^20\d\d$/.test(sp.fy || '') ? Number(sp.fy) : cur;
  const { profile, saved } = await getCompany();
  const tracking = profile.tracking_from;
  const all = await calendarForFy(fy);
  const owner = user.role === 'owner';

  const past = (i) => !i.done_on && tracking && i.due < tracking;
  const live = all.filter((i) => !past(i));
  const overdue = live.filter((i) => standing(i, today) === 'overdue');
  const soon = live.filter((i) => standing(i, today) === 'soon');
  const later = live.filter((i) => standing(i, today) === 'later');
  const done = live.filter((i) => i.done_on);
  const before = all.filter(past);

  // TDS hints only where they help now.
  const tds = {};
  for (const i of [...overdue, ...soon]) if (i.tdsMonth) tds[i.key] = await tdsWatch(i.tdsMonth);

  const byMonth = {};
  for (const i of later) (byMonth[i.due.slice(0, 7)] ||= []).push(i);

  const Item = ({ i }) => <ComplianceItem key={i.key} item={i} today={today} owner={owner} tds={tds[i.key]} />;

  return (
    <>
      <h1>Compliance, {fyLabel(fy)}</h1>
      <nav className="tabs">
        {[cur - 1, cur, cur + 1].map((y) => (
          <Link key={y} className={`tab${y === fy ? ' on' : ''}`} href={`/compliance?fy=${y}`}>{fyLabel(y)}</Link>
        ))}
      </nav>
      {!saved ? (
        <p className="ask">
          These are the usual dates for a private limited company. {owner ? <><Link href="/company">Add the company details</Link> so</> : 'Once the company details are filled in,'} the list shows only what applies.
        </p>
      ) : null}
      <p className="mute">Standard due dates. When the government extends one, change it on the item and say why. Anything marked CA is filed by the CA; the reminders go to them too.</p>

      {overdue.length ? <><h2>Overdue</h2>{overdue.map((i) => <Item key={i.key} i={i} />)}</> : null}
      <h2>Due in the next 7 days</h2>
      {soon.length ? soon.map((i) => <Item key={i.key} i={i} />) : <p className="mute">Nothing due this week.</p>}

      {Object.entries(byMonth).map(([m, list]) => (
        <section key={m}>
          <h2>{niceMonth(m)}</h2>
          {list.map((i) => <Item key={i.key} i={i} />)}
        </section>
      ))}

      {done.length ? (
        <details className="block">
          <summary><h2 style={{ display: 'inline' }}>Done ({done.length})</h2></summary>
          {done.map((i) => <Item key={i.key} i={i} />)}
        </details>
      ) : null}
      {before.length ? (
        <details className="block">
          <summary><h2 style={{ display: 'inline' }}>Before reminders started ({before.length})</h2></summary>
          <p className="mute">These were due before {tracking}. They're not reminded. Mark any of them done if you want the record here.</p>
          {before.map((i) => <ComplianceItem key={i.key} item={i} today={today} owner={owner} past />)}
        </details>
      ) : null}
    </>
  );
}
