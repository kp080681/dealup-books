import { requireUser } from '../../lib/auth';
import { q } from '../../lib/db';
import { DOC_TYPES } from '../../lib/documents';
import { fyLabel, fyOf } from '../../lib/compliance';
import { todayIST } from '../../lib/parse';
import SimpleForm from '../../components/SimpleForm';
import { uploadDocumentAction, removeDocumentAction } from '../books-actions';

export const dynamic = 'force-dynamic';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function Documents() {
  const user = await requireUser();
  const docs = (await q(
    `select d.id, d.doc_type, d.title, d.filename, d.size_bytes, d.fy, u.name as by_name,
            to_char(d.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as added
     from documents d left join users u on u.id = d.uploaded_by where d.removed_at is null order by d.doc_type, d.created_at desc`)).rows;
  const fy = fyOf(todayIST());
  const groups = DOC_TYPES.map((t) => [t, docs.filter((d) => d.doc_type === t)]).filter(([, l]) => l.length);
  return (
    <>
      <h1>Documents</h1>
      <p className="mute">The company's certificates, filings and proofs in one place. The CA's login can download them too. PDF, PNG or JPG, up to 5 MB each.</p>
      {user.role === 'owner' ? (
        <SimpleForm action={uploadDocumentAction} button="Upload" reset>
          <div className="grid">
            <label>What is it
              <select name="doc_type" defaultValue="Certificate of incorporation">{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label>Title (optional)<input name="title" placeholder="For example: GST certificate" /></label>
            <label>Financial year (optional)
              <select name="fy" defaultValue="">
                <option value="">Not for one year</option>
                {[fy + 1, fy, fy - 1, fy - 2].map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
              </select>
            </label>
          </div>
          <label>File<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
        </SimpleForm>
      ) : null}
      {groups.length === 0 ? <p className="mute">No documents yet. Start with the certificate of incorporation, PAN, TAN and GST certificate.</p> : null}
      {groups.map(([t, list]) => (
        <section key={t}>
          <h2>{t}</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id}>
                    <td className="wrap"><a href={`/api/documents/${d.id}`}>{d.title}</a></td>
                    <td>{d.fy ? fyLabel(d.fy) : ''}</td>
                    <td className="mute">{kb(d.size_bytes)}</td>
                    <td className="mute">Added {d.added}</td>
                    <td>{user.role === 'owner' ? (
                      <form action={removeDocumentAction}><input type="hidden" name="id" value={d.id} /><button className="link">Remove</button></form>
                    ) : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
