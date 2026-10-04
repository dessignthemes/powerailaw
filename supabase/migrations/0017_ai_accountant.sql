-- LawPower AI — AI Accountant: the firm's income and expenses, prepared for
-- the outside accountant. Safe to run more than once. Run after 0016.
--
-- Each row is one money movement (from a bank/card import, a receipt, or
-- typed in). The AI suggests a category; a person approves. Trust (IOLTA)
-- money is kept apart and never counted as income.

create table if not exists acct_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense', 'transfer')),
  txn_date date not null,
  description text not null default '' check (char_length(description) <= 500),
  counterparty text not null default '' check (char_length(counterparty) <= 200),
  amount numeric(14, 2) not null check (amount >= 0 and amount < 1000000000),
  category text not null default 'uncategorized' check (char_length(category) <= 60),
  account text not null default 'operating' check (account in ('operating', 'trust', 'credit_card', 'other')),
  payment_method text not null default '' check (char_length(payment_method) <= 60),
  client_id uuid references clients (id) on delete set null,
  matter_id uuid references matters (id) on delete set null,
  reimbursable boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'needs_review' check (status in ('needs_review', 'ready', 'excluded')),
  source text not null default 'manual' check (source in ('manual', 'receipt', 'bank_import')),
  receipt_path text,
  receipt_name text,
  external_ref text,
  ai_confidence numeric(4, 3) check (ai_confidence between 0 and 1),
  ai_reason text not null default '' check (char_length(ai_reason) <= 500),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acct_txn_org_date_idx on acct_transactions (org_id, txn_date desc);
create index if not exists acct_txn_matter_idx on acct_transactions (matter_id);
-- The same bank line imported twice is skipped. (Rows without a fingerprint
-- never clash: NULLs are distinct in a unique index.)
create unique index if not exists acct_txn_dedupe_idx on acct_transactions (org_id, external_ref);

alter table acct_transactions enable row level security;
drop policy if exists "Members manage their firm's books" on acct_transactions;
create policy "Members manage their firm's books"
  on acct_transactions for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Private bucket for receipts (paths start with the workspace id).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-receipts', 'accounting-receipts', false, 15728640,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
