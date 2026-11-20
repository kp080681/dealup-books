// Email reminders: 7 days before, 1 day before, and 1, 3 and 7 days after a missed date.
// One email a day per person, listing everything that needs attention.
import { q } from './db';
import { getCompany, openItems } from './books';
import { reminderKind, standing, daysBetween } from './compliance';
import { niceDate } from './format';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function when(item, today) {
  const d = daysBetween(today, item.due);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue (was due ${niceDate(item.due)})`;
  if (d === 0) return 'due today';
  if (d === 1) return `due tomorrow, ${niceDate(item.due)}`;
  return `due in ${d} days, ${niceDate(item.due)}`;
}

function compose(items, today, appUrl, forCa) {
  const overdue = items.filter((i) => standing(i, today) === 'overdue').length;
  const subject = overdue
    ? `DealUp Books: ${overdue} overdue, ${items.length - overdue} coming up`
    : `DealUp Books: ${items.length} due soon`;
  const intro = forCa
    ? 'These DealUp Strategies items are marked for you as the CA:'
    : 'These need attention:';
  const lines = items.map((i) => `- ${i.title}: ${when(i, today)}${i.owner === 'ca' && !forCa ? ' (CA)' : ''}`);
  const link = appUrl ? `${appUrl}/compliance` : '';
  const text = [intro, '', ...lines, '', link ? `Open the list: ${link}` : '', '', 'Standard due dates; the government sometimes extends them.'].join('\n');
  const html = `<p>${esc(intro)}</p><ul>${items.map((i) => `<li><b>${esc(i.title)}</b>: ${esc(when(i, today))}${i.owner === 'ca' && !forCa ? ' (CA)' : ''}</li>`).join('')}</ul>`
    + (link ? `<p><a href="${esc(link)}">Open the compliance list</a></p>` : '')
    + '<p style="color:#5d6b78;font-size:13px">Standard due dates; the government sometimes extends them.</p>';
  return { subject, text, html };
}

async function send(to, msg) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.REMINDER_FROM, to, ...msg }),
  });
  if (!r.ok) throw new Error(`Email service said ${r.status}`);
}

/**
 * @param {string} today  YYYY-MM-DD in India
 * @param {{force?: boolean}} opts  force: send everything overdue or due within 7 days now, and don't record it
 */
export async function sendReminders(today, { force = false } = {}) {
  if (!process.env.RESEND_API_KEY || !process.env.REMINDER_FROM) {
    return { error: 'Email is not set up yet. Add RESEND_API_KEY and REMINDER_FROM to the app settings on Utplava.' };
  }
  const { profile } = await getCompany();
  const open = (await openItems(today)).filter((i) => !i.done_on);
  let picked;
  if (force) {
    picked = open.filter((i) => ['overdue', 'soon'].includes(standing(i, today))).map((i) => ({ ...i, kind: 'manual' }));
  } else {
    const sent = new Set((await q(`select item_key, kind, to_char(due_on, 'YYYY-MM-DD') as due from reminders_sent`)).rows
      .map((r) => `${r.item_key}|${r.kind}|${r.due}`));
    picked = open.map((i) => ({ ...i, kind: reminderKind(i, today) }))
      .filter((i) => i.kind && !sent.has(`${i.key}|${i.kind}|${i.due}`));
  }
  if (!picked.length) return { summary: 'Nothing is due in the next 7 days, so no email was sent.', sent: 0 };

  const owners = (await q(`select email from users where role = 'owner'`)).rows.map((r) => r.email);
  const extra = String(profile.reminder_emails || '').split(/[,\s]+/).filter(Boolean);
  const mine = [...new Set([...owners, ...extra])];
  const appUrl = (process.env.BOOKS_URL || '').replace(/\/+$/, '');

  await send(mine, compose(picked, today, appUrl, false));
  const caItems = picked.filter((i) => i.owner === 'ca');
  const caEmail = profile.ca_email && !mine.includes(profile.ca_email) ? profile.ca_email : '';
  if (caEmail && caItems.length) await send([caEmail], compose(caItems, today, appUrl, true));

  if (!force) {
    for (const i of picked) {
      await q(`insert into reminders_sent (item_key, kind, due_on, sent_to) values ($1,$2,$3,$4) on conflict do nothing`,
        [i.key, i.kind, i.due, [...mine, ...(caEmail && i.owner === 'ca' ? [caEmail] : [])].join(', ')]);
    }
  }
  const who = caEmail && caItems.length ? `${mine.join(', ')} and the CA` : mine.join(', ');
  return { summary: `Sent a reminder about ${picked.length} item${picked.length === 1 ? '' : 's'} to ${who}.`, sent: picked.length };
}
