import crypto from 'crypto';
import { q } from '../../../../lib/db';
import { openItems } from '../../../../lib/books';
import { todayIST } from '../../../../lib/parse';
import { addDays } from '../../../../lib/compliance';

export const dynamic = 'force-dynamic';

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines longer than 75 bytes are folded, as the calendar format requires.
function fold(line) {
  const out = []; let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const d8 = (iso) => iso.replace(/-/g, '');

// A private calendar feed. Subscribe to it in Google Calendar or on the iPhone to get phone alerts.
export async function GET(_req, { params }) {
  const { token } = await params;
  const row = (await q('select calendar_token from company where id = 1')).rows[0];
  const want = row?.calendar_token || '';
  const a = crypto.createHash('sha256').update(String(token)).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  if (!want || !crypto.timingSafeEqual(a, b)) return new Response('Not found', { status: 404 });

  const today = todayIST();
  const items = (await openItems(today)).filter((i) => !i.done_on);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DealUp Books//Compliance//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:DealUp compliance', 'X-WR-TIMEZONE:Asia/Kolkata', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'];
  for (const i of items) {
    lines.push('BEGIN:VEVENT', `UID:${i.key}@dealup-books`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d8(i.due)}`, `DTEND;VALUE=DATE:${d8(addDays(i.due, 1))}`,
      `SUMMARY:${esc((i.owner === 'ca' ? 'CA: ' : 'Due: ') + i.title)}`,
      `DESCRIPTION:${esc(i.plain)}`, 'TRANSP:TRANSPARENT');
    for (const [trig, what] of [['-P7D', 'in 7 days'], ['-P1D', 'tomorrow']]) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trig}`, `DESCRIPTION:${esc(i.title + ' is due ' + what)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'inline; filename="dealup-compliance.ics"' },
  });
}
