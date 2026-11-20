// Server-side helpers for the company profile and the compliance calendar.
import { q, ACTIVE } from './db';
import { todayIST } from './parse';
import { buildCalendar, PROFILE_DEFAULTS, fyOf, standing, fyRange } from './compliance';

export async function getCompany() {
  const r = (await q('select profile, calendar_token from company where id = 1')).rows[0];
  const profile = { ...PROFILE_DEFAULTS, ...(r?.profile || {}) };
  // Until a start date is saved, only remind from this month on, not about the company's whole history.
  if (!profile.tracking_from) profile.tracking_from = `${todayIST().slice(0, 7)}-01`;
  return { profile, calendarToken: r?.calendar_token || null, saved: Boolean(r?.profile && Object.keys(r.profile).length) };
}

// The latest state of each item: done or not, and any changed due date.
async function itemStates() {
  const rows = (await q(
    `select ev.*, d.title as doc_title, u.name as by_name,
            to_char(ev.done_on, 'YYYY-MM-DD') as done_iso, to_char(ev.due_on, 'YYYY-MM-DD') as due_iso
     from compliance_events ev
     left join documents d on d.id = ev.document_id and d.removed_at is null
     left join users u on u.id = ev.created_by
     order by ev.id`)).rows;
  const st = {};
  for (const e of rows) {
    const s = (st[e.item_key] ||= {});
    if (e.action === 'done') Object.assign(s, { done_on: e.done_iso, done_note: e.note, document_id: e.doc_title ? e.document_id : null, doc_title: e.doc_title, done_by: e.by_name });
    if (e.action === 'undone') Object.assign(s, { done_on: null, done_note: '', document_id: null, doc_title: null, done_by: null });
    if (e.action === 'due_changed') Object.assign(s, { due_override: e.due_iso, due_reason: e.note });
  }
  return st;
}

function merge(items, st) {
  return items.map((it) => {
    const s = st[it.key] || {};
    const out = { ...it, standard_due: it.due, ...s };
    if (s.due_override) out.due = s.due_override;
    return out;
  });
}

async function ctx() {
  const { profile } = await getCompany();
  const st = await itemStates();
  const doneMap = Object.fromEntries(Object.entries(st).filter(([, s]) => s.done_on).map(([k, s]) => [k, s.done_on]));
  return { profile, st, doneMap };
}
const sortDue = (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
const forFy = (c, fy) => merge(buildCalendar(c.profile, fy, c.doneMap), c.st);

// All items whose period belongs to one financial year.
export async function calendarForFy(fy) {
  return forFy(await ctx(), fy).sort(sortDue);
}

// What is open around today: last year's items still due (ITR, AGM…) plus this year's and next year's.
export async function openItems(today) {
  const fy = fyOf(today);
  const c = await ctx();
  const seen = new Set();
  return [...forFy(c, fy - 1), ...forFy(c, fy), ...forFy(c, fy + 1)]
    .filter((i) => !seen.has(i.key) && seen.add(i.key))
    // Items due before tracking started are history, not reminders.
    .filter((i) => i.done_on || !c.profile.tracking_from || i.due >= c.profile.tracking_from)
    .sort(sortDue);
}

export async function dueSoon(today) {
  return (await openItems(today)).filter((i) => ['overdue', 'soon'].includes(standing(i, today)));
}

// Categories where TDS may apply. The app only points at them; the CA decides.
export const TDS_WATCH = ['Performance marketing fees', 'Professional fees', 'Rent'];

// Payments in a month that may have needed TDS, grouped by who was paid.
export async function tdsWatch(month) {
  return (await q(
    `select e.party, e.category, sum(e.amount_paise)::bigint as total, count(*)::int as n
     from entries e
     where ${ACTIVE} and e.direction = 'paid' and to_char(e.entry_date, 'YYYY-MM') = $1 and e.category = any($2)
     group by 1, 2 order by 3 desc`, [month, TDS_WATCH])).rows;
}

export { fyRange };
