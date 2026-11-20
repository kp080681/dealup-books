import { getUser } from '../../../../lib/auth';
import { q } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// Owner and CA can both download. Files are always sent as downloads, never shown inline.
export async function GET(_req, { params }) {
  const user = await getUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const d = (await q('select filename, mime, content from documents where id = $1 and removed_at is null', [id])).rows[0];
  if (!d) return new Response('Not found', { status: 404 });
  return new Response(d.content, {
    headers: {
      'Content-Type': d.mime,
      'Content-Disposition': `attachment; filename="${d.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
