'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { q } from '../lib/db';
import { requireOwner } from '../lib/auth';
import { PROFILE_DEFAULTS } from '../lib/compliance';
import { todayIST } from '../lib/parse';
import { DOC_TYPES, readUpload } from '../lib/documents';
import { sendReminders } from '../lib/reminders';

const str = (fd, k, max = 300) => String(fd.get(k) ?? '').trim().slice(0, max);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const emailList = (s) => s.split(/[,\s;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------- Company details ----------

export async function saveCompanyAction(_prev, fd) {
  const user = await requireOwner();
  const p = {};
  for (const [k, v] of Object.entries(PROFILE_DEFAULTS)) {
    if (typeof v === 'boolean') p[k] = fd.get(k) === 'on';
    else p[k] = str(fd, k, k === 'address' ? 400 : 200);
  }
  p.pan = p.pan.toUpperCase(); p.tan = p.tan.toUpperCase(); p.gstin = p.gstin.toUpperCase(); p.cin = p.cin.toUpperCase();
  if (p.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan)) return { error: 'The PAN should look like ABCDE1234F.' };
  if (p.tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(p.tan)) return { error: 'The TAN should look like BLRD12345E.' };
  if (p.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(p.gstin)) return { error: 'The GSTIN should be 15 characters, like 29ABCDE1234F1Z5.' };
  for (const k of ['incorporation_date', 'first_fy_end', 'tracking_from']) {
    if (p[k] && !isDate(p[k])) return { error: 'One of the dates is not valid.' };
  }
  if (!['monthly', 'qrmp'].includes(p.gst_scheme)) p.gst_scheme = 'monthly';
  if (p.dir_kyc_last_fy && !/^20\d\d$/.test(p.dir_kyc_last_fy)) return { error: 'For director KYC, enter the starting year of the financial year, for example 2025 for FY 2025-26.' };
  if (p.ca_email && !validEmail(p.ca_email.toLowerCase())) return { error: "The CA's email is not valid." };
  p.ca_email = p.ca_email.toLowerCase();
  const extra = emailList(p.reminder_emails);
  if (extra.some((e) => !validEmail(e))) return { error: 'One of the reminder emails is not valid.' };
  p.reminder_emails = extra.join(', ');
  if (!p.tracking_from) p.tracking_from = todayIST();
  await q(
    `insert into company (id, profile, updated_by, updated_at) values (1, $1, $2, now())
     on conflict (id) do update set profile = excluded.profile, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(p), user.id]);
  revalidatePath('/', 'layout');
  return { ok: 'Company details saved. The compliance calendar now follows them.' };
}

// ---------- Documents ----------

async function storeDocument(file, { docType, title, fy, userId }) {
  const up = await readUpload(file);
  if (up.error) return up;
  const r = await q(
    `insert into documents (doc_type, title, filename, mime, size_bytes, sha256, content, fy, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [docType, title || up.filename, up.filename, up.mime, up.bytes.length, up.sha256, up.bytes, fy, userId]);
  return { id: r.rows[0].id };
}

export async function uploadDocumentAction(_prev, fd) {
  const user = await requireOwner();
  const docType = DOC_TYPES.includes(str(fd, 'doc_type')) ? str(fd, 'doc_type') : 'Other';
  const fyRaw = str(fd, 'fy', 4);
  const fy = /^20\d\d$/.test(fyRaw) ? Number(fyRaw) : null;
  const res = await storeDocument(fd.get('file'), { docType, title: str(fd, 'title', 150), fy, userId: user.id });
  if (res.error) return res;
  revalidatePath('/documents');
  return { ok: 'Saved to Documents.', at: Date.now() };
}

export async function removeDocumentAction(fd) {
  const user = await requireOwner();
  // Kept in the database for the record; only hidden from the list.
  await q('update documents set removed_at = now(), removed_by = $2 where id = $1 and removed_at is null', [Number(fd.get('id')), user.id]);
  revalidatePath('/documents');
}

// ---------- Compliance ----------

const KEY_RE = /^[a-z0-9-]+(:[0-9A-Z-]+)?$/;

export async function markDoneAction(_prev, fd) {
  const user = await requireOwner();
  const key = str(fd, 'key', 60);
  if (!KEY_RE.test(key)) return { error: 'Unknown item.' };
  const doneOn = str(fd, 'done_on', 10);
  if (!isDate(doneOn) || doneOn > todayIST()) return { error: 'Enter the date it was done (today or earlier).' };
  const note = str(fd, 'note', 500);
  let documentId = null;
  const file = fd.get('proof');
  if (file && typeof file === 'object' && file.size > 0) {
    const res = await storeDocument(file, { docType: 'Proof of filing or payment', title: str(fd, 'title', 150), fy: null, userId: user.id });
    if (res.error) return res;
    documentId = res.id;
  }
  await q(`insert into compliance_events (item_key, action, done_on, note, document_id, created_by) values ($1,'done',$2,$3,$4,$5)`,
    [key, doneOn, note, documentId, user.id]);
  revalidatePath('/', 'layout');
  return { ok: 'Marked done.' };
}

export async function undoDoneAction(fd) {
  const user = await requireOwner();
  const key = str(fd, 'key', 60);
  if (!KEY_RE.test(key)) return;
  await q(`insert into compliance_events (item_key, action, note, created_by) values ($1,'undone','Marked not done',$2)`, [key, user.id]);
  revalidatePath('/', 'layout');
}

export async function changeDueAction(_prev, fd) {
  const user = await requireOwner();
  const key = str(fd, 'key', 60);
  if (!KEY_RE.test(key)) return { error: 'Unknown item.' };
  const due = str(fd, 'due_on', 10);
  const reason = str(fd, 'reason', 300);
  if (!isDate(due)) return { error: 'Enter the new due date.' };
  if (!reason) return { error: 'Say why the date changed, for example "Extended by CBDT to 10 December".' };
  await q(`insert into compliance_events (item_key, action, due_on, note, created_by) values ($1,'due_changed',$2,$3,$4)`, [key, due, reason, user.id]);
  revalidatePath('/', 'layout');
  return { ok: 'Due date changed.' };
}

// ---------- Reminders ----------

export async function newCalendarLinkAction() {
  await requireOwner();
  const token = crypto.randomBytes(24).toString('base64url');
  await q(`insert into company (id, calendar_token) values (1, $1) on conflict (id) do update set calendar_token = excluded.calendar_token`, [token]);
  revalidatePath('/settings');
}

export async function sendRemindersNowAction() {
  await requireOwner();
  const res = await sendReminders(todayIST(), { force: true });
  return res.error ? { error: res.error } : { ok: res.summary };
}
