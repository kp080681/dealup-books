import { requireUser } from '../../lib/auth';
import { q } from '../../lib/db';
import SimpleForm from '../../components/SimpleForm';
import { headers } from 'next/headers';
import { saveViewerAction, removeViewerAction, changePasswordAction } from '../actions';
import { newCalendarLinkAction, sendRemindersNowAction } from '../books-actions';
import { getCompany } from '../../lib/books';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const user = await requireUser();
  const viewers = user.role === 'owner'
    ? (await q(`select id, name, email from users where role = 'viewer' order by id`)).rows : [];
  let feed = '';
  if (user.role === 'owner') {
    const { calendarToken } = await getCompany();
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (calendarToken) feed = `${proto}://${host}/api/calendar/${calendarToken}`;
  }
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM);
  return (
    <>
      <h1>Settings</h1>
      {user.role === 'owner' ? (
        <>
          <h2>Reminders on your phone</h2>
          <p className="mute">
            A private calendar link. Add it to Google Calendar (Other calendars → From URL) or the iPhone Calendar
            (Add subscribed calendar), and every due date shows up with alerts 7 days and 1 day before. Anyone with the link can
            see the due dates, so keep it to yourself. Making a new link stops the old one.
          </p>
          {feed ? <p className="card" style={{ wordBreak: 'break-all' }}><code>{feed}</code></p> : null}
          <form action={newCalendarLinkAction}><button>{feed ? 'Make a new link' : 'Make my calendar link'}</button></form>

          <h2>Email reminders</h2>
          {emailReady ? (
            <>
              <p className="mute">Sent each morning 7 days and 1 day before each due date, and again if a date is missed. You get everything; the CA gets the items marked CA (set their email in Company details).</p>
              <SimpleForm action={sendRemindersNowAction} button="Send me this week's list now" />
            </>
          ) : (
            <p className="ask">Email reminders are not switched on yet. They need an email service key (RESEND_API_KEY) and a sender address (REMINDER_FROM) saved as this app's settings on Utplava.</p>
          )}
        </>
      ) : null}

      {user.role === 'owner' ? (
        <>
          <h2>Read-only login for the CA</h2>
          <p className="mute">They can see the ledger and download it. They cannot add, correct or cancel anything.</p>
          {viewers.map((v) => (
            <form key={v.id} action={removeViewerAction} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="hidden" name="id" value={v.id} />
              <span style={{ flex: 1 }}>{v.name} — {v.email}</span>
              <button className="danger">Remove access</button>
            </form>
          ))}
          <SimpleForm action={saveViewerAction} button="Save read-only login">
            <label>Name<input name="name" required /></label>
            <label>Email<input type="email" name="email" required /></label>
            <label>Password (10+ characters; saving again for the same email resets it)
              <input type="password" name="password" autoComplete="new-password" minLength={10} required />
            </label>
          </SimpleForm>
        </>
      ) : null}

      <h2>Change my password</h2>
      <SimpleForm action={changePasswordAction} button="Change password">
        <label>Current password<input type="password" name="current" autoComplete="current-password" required /></label>
        <label>New password (10+ characters)<input type="password" name="next" autoComplete="new-password" minLength={10} required /></label>
      </SimpleForm>
    </>
  );
}
