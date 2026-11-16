import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { q } from './db';

const COOKIE = 'dub_session';
const DAYS = 14;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw new Error('SESSION_SECRET is not set (needs 24+ characters)');
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac); const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export async function startSession(userId) {
  const jar = await cookies();
  jar.set(COOKIE, sign({ uid: userId, exp: Date.now() + DAYS * 86400000 }), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser() {
  const p = verify((await cookies()).get(COOKIE)?.value);
  if (!p) return null;
  const r = await q('select id, email, name, role from users where id = $1', [p.uid]);
  return r.rows[0] || null;
}

export async function requireUser() {
  const u = await getUser();
  if (!u) redirect('/login');
  return u;
}

// The CA's login is read-only. Every change goes through this check on the server.
export async function requireOwner() {
  const u = await requireUser();
  if (u.role !== 'owner') throw new Error('This login is read-only.');
  return u;
}
