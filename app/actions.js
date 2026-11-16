'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, ACTIVE } from '../lib/db';
import { startSession, endSession, requireOwner, requireUser } from '../lib/auth';
import { parseEntry, ACCOUNTS, CATEGORIES } from '../lib/parse';

const str = (fd, k, max = 500) => String(fd.get(k) ?? '').trim().slice(0, max);
const emailOf = (fd) => str(fd, 'email', 200).toLowerCase();

function passwordProblem(p) {
  if (p.length < 10) return 'Use at least 10 characters for the password.';
  return '';
}

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// ---------- First-time setup and sign-in ----------

export async function setupAction(_prev, fd) {
  const existing = await q('select count(*)::int as n from users');
  if (existing.rows[0].n > 0) redirect('/login');
  const code = process.env.SETUP_CODE;
  if (!code) return { error: 'SETUP_CODE is not set for this app yet.' };
  if (!sameText(str(fd, 'code'), code)) return { error: 'That setup code is not right.' };
  const email = emailOf(fd); const name = str(fd, 'name', 100); const password = String(fd.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) return { error: 'Enter your name and email.' };
  const bad = passwordProblem(password);
  if (bad) return { error: bad };
  const hash = await bcrypt.hash(password, 12);
  const r = await q(
    `insert into users (email, name, role, password_hash)
     select $1, $2, 'owner', $3 where not exists (select 1 from users) returning id`,
    [email, name, hash]);
  if (!r.rows[0]) redirect('/login');
  await startSession(r.rows[0].id);
  redirect('/');
}

export async function loginAction(_prev, fd) {
  const email = emailOf(fd); const password = String(fd.get('password') ?? '');
  const fails = await q(
    `select count(*)::int as n from login_attempts where email = $1 and not ok and at > now() - interval '15 minutes'`, [email]);
  if (fails.rows[0].n >= 5) return { error: 'Too many wrong attempts. Try again in 15 minutes.' };
  const r = await q('select id, password_hash from users where email = $1', [email]);
  const user = r.rows[0];
  // Compare against a dummy hash when the email is unknown, so timing gives nothing away.
  globalThis.__dubDummy ||= bcrypt.hashSync(crypto.randomUUID(), 12);
  const ok = await bcrypt.compare(password, user?.password_hash || globalThis.__dubDummy);
  await q('insert into login_attempts (email, ok) values ($1, $2)', [email, Boolean(user && ok)]);
  if (!user || !ok) return { error: 'Email or password is not right.' };
  await startSession(user.id);
  redirect('/');
}

export async function logoutAction() {
  await endSession();
  redirect('/login');
}

// ---------- Entries ----------

export async function parseAction(_prev, fd) {
  await requireOwner();
  const text = str(fd, 'text', 1000);
  if (!text) return { error: 'Type what was paid or received.' };
  return { proposal: parseEntry(text), nonce: crypto.randomUUID() };
}

function readEntry(fd) {
  const e = {
    entry_date: str(fd, 'entry_date', 10),
    direction: str(fd, 'direction', 10),
    amount: str(fd, 'amount', 30).replace(/[₹,\s]/g, ''),
    account: str(fd, 'account', 40),
    party: str(fd, 'party', 120),
    category: str(fd, 'category', 60),
    client: str(fd, 'client', 120),
    period_month: str(fd, 'period_month', 7),
    note: str(fd, 'note', 500),
    ca_flags: str(fd, 'ca_flags', 1000),
    source_text: str(fd, 'source_text', 1000),
    source_type: str(fd, 'source_type', 10) === 'message' ? 'message' : 'form',
  };
  const d = new Date(e.entry_date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.entry_date) || isNaN(d) || d.toISOString().slice(0, 10) !== e.entry_date) return { error: 'Enter a valid date.' };
  if (!['paid', 'received'].includes(e.direction)) return { error: 'Choose paid or received.' };
  if (!/^\d+(\.\d{1,2})?$/.test(e.amount) || Number(e.amount) <= 0) return { error: 'Enter the amount as a number, for example 20000.' };
  if (!ACCOUNTS.includes(e.account)) return { error: 'Choose the account.' };
  if (!CATEGORIES.includes(e.category)) e.category = 'Uncategorised';
  if (e.period_month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.period_month)) return { error: 'The month the work relates to is not valid.' };
  e.amount_paise = Math.round(Number(e.amount) * 100);
  return { entry: e };
}

const INSERT = `insert into entries
  (kind, corrects_id, reason, entry_date, direction, amount_paise, account, party, category, client,
   period_month, note, ca_flags, source_type, source_text, created_by)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`;

export async function saveEntryAction(_prev, fd) {
  const user = await requireOwner();
  const { entry: e, error } = readEntry(fd);
  if (error) return { error };
  const correctsId = Number(fd.get('corrects_id')) || null;
  const reason = str(fd, 'reason', 500);
  if (correctsId) {
    if (!reason) return { error: 'Say why this entry is being corrected.' };
    const t = await q(`select e.id from entries e where e.id = $1 and ${ACTIVE}`, [correctsId]);
    if (!t.rows[0]) return { error: 'That entry was already corrected or cancelled.' };
  }
  let r;
  try {
    r = await q(INSERT, [
      correctsId ? 'correction' : 'entry', correctsId, correctsId ? reason : null,
      e.entry_date, e.direction, e.amount_paise, e.account, e.party, e.category, e.client,
      e.period_month, e.note, e.ca_flags, e.source_type, e.source_text, user.id]);
  } catch (err) {
    if (err.code === '23505') return { error: 'That entry was already corrected or cancelled.' };
    throw err;
  }
  revalidatePath('/');
  if (correctsId) redirect(`/entry/${r.rows[0].id}`);
  return { ok: true, id: r.rows[0].id, at: Date.now() };
}

export async function voidEntryAction(_prev, fd) {
  const user = await requireOwner();
  const id = Number(fd.get('id'));
  const reason = str(fd, 'reason', 500);
  if (!reason) return { error: 'Say why this entry is being cancelled.' };
  const t = await q(`select e.* from entries e where e.id = $1 and ${ACTIVE}`, [id]);
  const o = t.rows[0];
  if (!o) return { error: 'That entry was already corrected or cancelled.' };
  let r;
  try {
    r = await q(INSERT, ['void', id, reason, o.entry_date, o.direction, o.amount_paise, o.account, o.party,
      o.category, o.client, o.period_month, o.note, o.ca_flags, o.source_type, o.source_text, user.id]);
  } catch (err) {
    if (err.code === '23505') return { error: 'That entry was already corrected or cancelled.' };
    throw err;
  }
  revalidatePath('/');
  redirect(`/entry/${r.rows[0].id}`);
}

// ---------- Settings ----------

export async function saveViewerAction(_prev, fd) {
  await requireOwner();
  const email = emailOf(fd); const name = str(fd, 'name', 100); const password = String(fd.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) return { error: 'Enter the name and email.' };
  const bad = passwordProblem(password);
  if (bad) return { error: bad };
  const hash = await bcrypt.hash(password, 12);
  const clash = await q(`select role from users where email = $1`, [email]);
  if (clash.rows[0]?.role === 'owner') return { error: 'That email is the owner login.' };
  await q(
    `insert into users (email, name, role, password_hash) values ($1, $2, 'viewer', $3)
     on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash`,
    [email, name, hash]);
  revalidatePath('/settings');
  return { ok: `Read-only login saved for ${email}. Share the password with them privately.` };
}

export async function removeViewerAction(fd) {
  await requireOwner();
  await q(`delete from users where id = $1 and role = 'viewer'`, [Number(fd.get('id'))]);
  revalidatePath('/settings');
}

export async function changePasswordAction(_prev, fd) {
  const user = await requireUser();
  const current = String(fd.get('current') ?? ''); const next = String(fd.get('next') ?? '');
  const r = await q('select password_hash from users where id = $1', [user.id]);
  if (!(await bcrypt.compare(current, r.rows[0].password_hash))) return { error: 'Current password is not right.' };
  const bad = passwordProblem(next);
  if (bad) return { error: bad };
  await q('update users set password_hash = $1 where id = $2', [await bcrypt.hash(next, 12), user.id]);
  return { ok: 'Password changed.' };
}
