import { getUser } from '../../../lib/auth';
import { q, ACTIVE } from '../../../lib/db';
import { ACCOUNTS } from '../../../lib/parse';

export const dynamic = 'force-dynamic';

// Quote every cell, and neutralise cells a spreadsheet could read as a formula.
function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export async function GET(req) {
  const user = await getUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  const sp = new URL(req.url).searchParams;
  const where = [sp.get('history') === '1' ? 'true' : ACTIVE];
  const params = [];
  const month = sp.get('month');
  if (month && /^\d{4}-\d{2}$/.test(month)) { params.push(month); where.push(`to_char(e.entry_date, 'YYYY-MM') = $${params.length}`); }
  const account = sp.get('account');
  if (ACCOUNTS.includes(account)) { params.push(account); where.push(`e.account = $${params.length}`); }
  if (sp.get('flagged') === '1') where.push(`e.ca_flags <> ''`);

  const rows = (await q(
    `select e.*, (${ACTIVE}) as active from entries e where ${where.join(' and ')} order by e.entry_date, e.id`, params)).rows;

  const head = ['Entry #', 'Date', 'Type', 'Amount (INR)', 'Account', 'Party', 'Category', 'Client', 'Work month',
    'Note', 'Questions for CA', 'Status', 'Replaces entry #', 'Reason', 'Source', 'Source text'];
  const lines = [head.map(cell).join(',')];
  for (const e of rows) {
    const status = e.kind === 'void' ? 'Cancellation' : !e.active ? 'Replaced' : e.kind === 'correction' ? 'Correction' : 'Active';
    lines.push([e.id, e.entry_date, e.direction === 'received' ? 'Received' : 'Paid', (Number(e.amount_paise) / 100).toFixed(2),
      e.account, e.party, e.category, e.client, e.period_month, e.note, e.ca_flags, status, e.corrects_id ?? '', e.reason ?? '',
      e.source_type, e.source_text].map(cell).join(','));
  }
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dealup-ledger${month ? '-' + month : ''}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
