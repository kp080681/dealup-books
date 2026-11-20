import crypto from 'crypto';
import { sendReminders } from '../../../lib/reminders';
import { todayIST } from '../../../lib/parse';

export const dynamic = 'force-dynamic';

// Called once a day by the scheduled GitHub workflow (.github/workflows/reminders.yml).
export async function POST(req) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  if (secret.length < 24 || !crypto.timingSafeEqual(a, b)) return Response.json({ error: 'Not allowed.' }, { status: 401 });
  const res = await sendReminders(todayIST());
  return Response.json(res, { status: res.error ? 503 : 200 });
}
