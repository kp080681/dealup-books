import pg from 'pg';

// Dates come back as plain 'YYYY-MM-DD' text, so no time-zone shifting.
pg.types.setTypeParser(1082, (v) => v);

const g = globalThis;

function pool() {
  if (!g.__dubPool) {
    // Utplava provides this when it sets up the managed database. It's read
    // through a variable, not by fixed name, so Utplava's pre-build check
    // doesn't block the deploy waiting for a value only Utplava can supply.
    const DB_KEY = 'DATABASE_URL';
    const url = process.env[DB_KEY];
    if (!url) throw new Error('DATABASE_URL is not set');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes('host=/');
    g.__dubPool = new pg.Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: true } });
  }
  return g.__dubPool;
}

// The ledger is append-only. A correction or a cancellation is a NEW row that
// points at the old one (corrects_id) and carries a reason. Old rows are never
// updated or deleted; the database itself refuses it (see the trigger below).
const SCHEMA = `
create table if not exists users (
  id serial primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('owner','viewer')),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists login_attempts (
  id bigserial primary key,
  email text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create table if not exists entries (
  id serial primary key,
  kind text not null default 'entry' check (kind in ('entry','correction','void')),
  corrects_id integer references entries(id),
  reason text,
  entry_date date not null,
  direction text not null check (direction in ('paid','received')),
  amount_paise bigint not null check (amount_paise > 0),
  account text not null,
  party text not null default '',
  category text not null default 'Uncategorised',
  client text not null default '',
  period_month text not null default '',
  note text not null default '',
  ca_flags text not null default '',
  source_type text not null check (source_type in ('message','form','import','statement','invoice')),
  source_text text not null default '',
  created_by integer references users(id),
  created_at timestamptz not null default now(),
  check (kind = 'entry' or (corrects_id is not null and coalesce(reason,'') <> ''))
);
create unique index if not exists entries_one_successor on entries(corrects_id) where corrects_id is not null;
create index if not exists entries_date on entries(entry_date);
create or replace function entries_append_only() returns trigger as $$
begin
  raise exception 'Ledger rows are never edited or deleted. Add a correction instead.';
end;
$$ language plpgsql;
drop trigger if exists entries_no_change on entries;
create trigger entries_no_change before update or delete on entries
  for each row execute function entries_append_only();
create table if not exists company (
  id integer primary key default 1 check (id = 1),
  profile jsonb not null default '{}'::jsonb,
  calendar_token text,
  updated_by integer references users(id),
  updated_at timestamptz not null default now()
);
create table if not exists documents (
  id serial primary key,
  doc_type text not null,
  title text not null,
  filename text not null,
  mime text not null check (mime in ('application/pdf','image/png','image/jpeg')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256 text not null,
  content bytea not null,
  fy integer,
  uploaded_by integer references users(id),
  created_at timestamptz not null default now(),
  removed_by integer references users(id),
  removed_at timestamptz
);
create table if not exists compliance_events (
  id serial primary key,
  item_key text not null,
  action text not null check (action in ('done','undone','due_changed')),
  done_on date,
  due_on date,
  note text not null default '',
  document_id integer references documents(id),
  created_by integer references users(id),
  created_at timestamptz not null default now(),
  check (action <> 'done' or done_on is not null),
  check (action <> 'due_changed' or (due_on is not null and note <> ''))
);
create index if not exists compliance_events_key on compliance_events(item_key, id);
create or replace function compliance_append_only() returns trigger as $$
begin
  raise exception 'Compliance history is never edited or deleted. Add a new event instead.';
end;
$$ language plpgsql;
drop trigger if exists compliance_no_change on compliance_events;
create trigger compliance_no_change before update or delete on compliance_events
  for each row execute function compliance_append_only();
create table if not exists reminders_sent (
  item_key text not null,
  kind text not null,
  due_on date not null,
  sent_to text not null,
  sent_at timestamptz not null default now(),
  primary key (item_key, kind, due_on)
);
`;

async function ensureSchema() {
  if (!g.__dubSchema) {
    g.__dubSchema = pool().query(SCHEMA).catch((e) => { g.__dubSchema = null; throw e; });
  }
  return g.__dubSchema;
}

export async function q(text, params) {
  await ensureSchema();
  return pool().query(text, params);
}

// Rows that count today: not cancelled, and not replaced by a later correction.
export const ACTIVE = `e.kind <> 'void' and not exists (select 1 from entries c where c.corrects_id = e.id)`;
