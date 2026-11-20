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
create table if not exists clients (
  id serial primary key,
  name text not null,
  address text not null default '',
  state text not null default '',
  country text not null default 'India',
  gstin text not null default '',
  email text not null default '',
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists clients_name on clients (lower(name));
create table if not exists invoices (
  id serial primary key,
  number text not null,
  fy integer not null,
  source text not null check (source in ('generated','uploaded')),
  status text not null default 'issued' check (status in ('issued','cancelled')),
  invoice_date date not null,
  due_date date,
  client_id integer references clients(id),
  client_name text not null,
  client_address text not null default '',
  client_state text not null default '',
  client_country text not null default 'India',
  client_gstin text not null default '',
  supply_type text not null check (supply_type in ('intra','inter','export')),
  currency text not null default 'INR',
  fx_rate numeric(12,4),
  gst_rate numeric(5,2) not null default 0,
  gst_waived_reason text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal_minor bigint not null,
  cgst_minor bigint not null default 0,
  sgst_minor bigint not null default 0,
  igst_minor bigint not null default 0,
  total_minor bigint not null,
  notes text not null default '',
  document_id integer references documents(id),
  created_by integer references users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by integer references users(id),
  cancel_reason text not null default '',
  check (status <> 'cancelled' or cancel_reason <> '')
);
create unique index if not exists invoices_generated_number on invoices (lower(number)) where source = 'generated';
create index if not exists invoices_date on invoices (invoice_date);
create or replace function invoices_locked() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoices are never deleted. Cancel it with a reason instead.';
  end if;
  if old.status = 'issued' and new.status = 'cancelled'
     and (to_jsonb(new) - array['status','cancelled_at','cancelled_by','cancel_reason'])
       = (to_jsonb(old) - array['status','cancelled_at','cancelled_by','cancel_reason']) then
    return new;
  end if;
  raise exception 'An issued invoice cannot be changed. Cancel it with a reason and issue a new one.';
end;
$$ language plpgsql;
drop trigger if exists invoices_no_change on invoices;
create trigger invoices_no_change before update or delete on invoices
  for each row execute function invoices_locked();
