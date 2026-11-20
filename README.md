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

## What it does (step 2: compliance)

- **Company details** (`/company`): PAN, TAN, GSTIN, dates, and switches for what
  applies (GST monthly or quarterly, LUT, TDS, professional tax, director loans,
  MSME suppliers, advance tax). The compliance calendar is built from these.
- **Compliance calendar** (`/compliance`): every due date for the financial year,
  from `lib/compliance.js`. It covers TDS by the 7th (30 April for March) and the
  quarterly TDS returns, GSTR-1 and GSTR-3B (monthly or QRMP, with the state's 22nd or
  24th), LUT renewal, professional tax, the ITR, the AGM (the first one within 9
  months), AOC-4, MGT-7/7A, ADT-1, board meetings, DPT-3, MSME-1, director KYC
  (every three years) and INC-20A. Each item says in plain words what it is and
  whether you or the CA does it.
- **Done, with proof.** Marking an item done records the date, a note and,
  optionally, the challan or acknowledgement, which is saved to Documents. History is
  append-only: "not done" and due-date changes are new events, and the database refuses
  edits.
- **Due-date changes** need a reason, for example a CBDT extension.
- **TDS watch.** Pay-TDS items list the month's payments for performance
  marketing, professional fees and rent, so a missed deduction is caught before the 7th. The
  CA decides whether TDS applies.
- **Documents** (`/documents`): PDF, PNG or JPG files up to 5 MB, checked by their
  content and stored in the database. The CA can download them. Removing a file hides it but
  keeps it on record.
- **Reminders:**
  - Email at 7 days, 1 day, and 1, 3 and 7 days late. The CA gets the CA items. Needs
    `RESEND_API_KEY` and `REMINDER_FROM`.
  - A private calendar feed (`/settings`) for phone alerts in Google Calendar or the iPhone.
  - The "Due this week" box on the ledger page.
- **Ledger:** a financial-year filter on the ledger and the CSV. Money received from a
  payer who isn't a known client stays "Unidentified receipt" until it is explained.

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
| `RESEND_API_KEY` | Optional. Key from resend.com for email reminders. |
| `REMINDER_FROM` | Optional. The sender, for example `DealUp Books <books@dealup.co.in>`. The domain must be verified on Resend. |
| `BOOKS_URL` | Optional. The app's address, used for links in emails. |
| `CRON_SECRET` | Optional. 24+ random characters. The daily GitHub workflow sends it to `/api/reminders`. |

The daily send is `.github/workflows/reminders.yml` (8:00 India time). It needs the
repository secrets `BOOKS_URL` and `CRON_SECRET`, and it does nothing until they are set.

## Database

The schema is in [`db/schema.sql`](db/schema.sql). The app applies it
automatically on its first database connection (`lib/db.js`), and every
statement is idempotent (`create … if not exists`), so there's no separate
migration step. Tables:

- `users`: the owner and read-only logins, with bcrypt password hashes.
- `login_attempts`: used to lock out an email after 5 wrong passwords in 15 minutes.
- `company`: the one company profile (JSON) and the calendar-feed token.
- `documents`: uploaded files (bytes in the database), with soft removal.
- `compliance_events`: done, not done and due-date changes per item. Append-only.
- `reminders_sent`: which reminder went out for which item, so none repeats.
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
