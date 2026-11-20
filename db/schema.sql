-- DealUp Ledger database schema.
-- The app applies this automatically on first connection (lib/db.js).
-- Keep the two identical: test/schema.test.mjs checks it.
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
