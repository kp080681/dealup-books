import { redirect } from 'next/navigation';
import { getUser } from '../../lib/auth';
import { q } from '../../lib/db';
import SimpleForm from '../../components/SimpleForm';
import { loginAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Login() {
  if (await getUser()) redirect('/');
  const n = (await q('select count(*)::int as n from users')).rows[0].n;
  if (n === 0) redirect('/setup');
  return (
    <div className="narrow">
      <h1>DealUp Books</h1>
      <SimpleForm action={loginAction} button="Sign in">
        <label>Email<input type="email" name="email" autoComplete="username" required /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
      </SimpleForm>
    </div>
  );
}
