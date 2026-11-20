# DealUp Ledger

The books tool for DealUp Strategies Private Limited. It's live at
https://dealup-ledger.utplava.dev and hosted on [Utplava](https://utplava.dev).

## What it does (step 1)

- **Logins:** one owner with full access and any number of read-only logins
  (for the CA). Read-only users can view and download, but every change is
  checked on the server and refused for them.
- **Entries by typed sentence or by form.** For example, "paid Preethesh 20,000 from HDFC
  for September" becomes a proposed row. You check it and confirm. If something
  essential is missing, the app asks one question.
- **An append-only ledger.** A correction or a cancellation is a new row that points
  to the old one, with a reason. The database refuses any `UPDATE` or `DELETE`
  on `entries` through a trigger.
- **Questions for the CA.** The app never decides a tax treatment. Anything that
  needs one becomes a flagged question on the entry.
- **CSV export,** filterable by month and account, with full correction history
  when "Show corrected and cancelled" is ticked.

## Run it locally

Requirements: Node.js 20 or later and PostgreSQL 14 or later.

```bash
npm install
createdb dealup_ledger                     # or any empty Postgres database
cp .env.example .env.local                 # then fill in the values
npm run dev                                # http://localhost:3000
```

On the first visit you're sent to `/setup`. Enter your `SETUP_CODE` to create
the owner login. The setup page works only once.

Production build: `npm run build && npm start`.

Tests: `npm test` covers the sentence parser and checks that `db/schema.sql`
matches the schema the app applies.

## Environment variables

These are names only. Never commit values: `.env*` files are git-ignored.

| Name | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. On Utplava this is provided automatically by the managed database. |
| `SESSION_SECRET` | Random text, 24 or more characters, used to sign login cookies. Changing it signs everyone out. |
| `SETUP_CODE` | One-time code typed on `/setup` to create the owner login. |

## Database

The schema is in [`db/schema.sql`](db/schema.sql). The app applies it
automatically on its first database connection (`lib/db.js`), and every
statement is idempotent (`create … if not exists`), so there's no separate
migration step. Tables:

- `users`: the owner and read-only logins, with bcrypt password hashes.
- `login_attempts`: used to lock out an email after 5 wrong passwords in 15 minutes.
- `entries`: the ledger. Amounts are stored in paise. `kind` is
  `entry`, `correction` or `void`, and `corrects_id` links a correction to the row it
  replaces. Each row can be replaced only once, and rows are never edited or deleted.

## Code map

- `lib/parse.js`: turns a typed sentence into a proposed entry.
- `lib/db.js`: database connection and schema.
- `lib/auth.js`: signed-cookie sessions plus the owner and read-only checks.
- `app/actions.js`: every server action (setup, login, save, correct, cancel, settings).
- `app/page.js`: entry box, monthly totals and the ledger table.
- `app/entry/[id]/page.js`: one entry with its history, correction and cancellation.
- `app/api/export/route.js`: CSV export, with formula-injection-safe cells.

## Deploying on Utplava

Utplava detects Next.js and Postgres (from the `pg` dependency) and provides a
managed database. Save `SESSION_SECRET` and `SETUP_CODE` as the app's settings.
`lib/db.js` reads `DATABASE_URL` through a variable rather than by fixed name,
to work around a Utplava pre-build check fixed in
[Cloud-for-small-software#1](https://github.com/kp080681/Cloud-for-small-software/pull/1).
