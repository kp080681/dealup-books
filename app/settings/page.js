import { requireUser } from '../../lib/auth';
import { q } from '../../lib/db';
import SimpleForm from '../../components/SimpleForm';
import { saveViewerAction, removeViewerAction, changePasswordAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const user = await requireUser();
  const viewers = user.role === 'owner'
    ? (await q(`select id, name, email from users where role = 'viewer' order by id`)).rows : [];
  return (
    <>
      <h1>Settings</h1>

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
