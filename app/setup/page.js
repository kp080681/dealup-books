import { redirect } from 'next/navigation';
import { q } from '../../lib/db';
import SimpleForm from '../../components/SimpleForm';
import { setupAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Setup() {
  const n = (await q('select count(*)::int as n from users')).rows[0].n;
  if (n > 0) redirect('/login');
  return (
    <div className="narrow">
      <h1>Set up DealUp Books</h1>
      <p className="mute">This page works once, to create the owner login.</p>
      <SimpleForm action={setupAction} button="Create owner login">
        <label>Setup code<input type="password" name="code" required autoComplete="off" /></label>
        <label>Your name<input name="name" required /></label>
        <label>Email<input type="email" name="email" autoComplete="username" required /></label>
        <label>Password (10+ characters)<input type="password" name="password" autoComplete="new-password" minLength={10} required /></label>
      </SimpleForm>
    </div>
  );
}
