import './globals.css';
import Link from 'next/link';
import { getUser } from '../lib/auth';
import { logoutAction } from './actions';

export const metadata = { title: 'DealUp Books', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  let user = null;
  try { user = await getUser(); } catch { /* settings missing: pages show the reason */ }
  return (
    <html lang="en">
      <body>
        {user ? (
          <header className="top">
            <strong>DealUp Books</strong>
            <nav>
              <Link href="/">Ledger</Link>
              <Link href="/invoices">Invoices</Link>
              <Link href="/compliance">Compliance</Link>
              <Link href="/documents">Documents</Link>
              <Link href="/company">Company</Link>
              <Link href="/settings">Settings</Link>
            </nav>
            <span className="mute">{user.name}{user.role === 'viewer' ? ' (read-only)' : ''}</span>
            <form action={logoutAction}><button className="link">Sign out</button></form>
          </header>
        ) : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
