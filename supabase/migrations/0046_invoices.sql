-- 0046: Invoices for matters (operating account), paid status everywhere.
--   invoices        one per bill: number INV-2026-0001, matter, client, dates, totals, status
--   invoice_lines   what's billed: flat fee, time (from Time Tracking), costs, other
--   time_entries.invoice_id     time already billed (so it isn't billed twice)
--   acct_transactions.invoice_id  the payment that paid an invoice (operating ledger),
--                                 or the trust transfer that paid it from trust
--   acct_transactions.source    adds 'invoice' (rows LawPower writes when a payment is recorded)
-- Safe to run more than once.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  matter_id uuid references public.matters (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  number text not null check (char_length(number) between 1 and 40),
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'void')),
  total numeric(14, 2) not null default 0 check (total >= 0 and total < 1000000000),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0 and amount_paid < 1000000000),
  paid_at date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists invoices_org_number_uidx on public.invoices (org_id, number);
create index if not exists invoices_org_matter_idx on public.invoices (org_id, matter_id);
create index if not exists invoices_org_status_idx on public.invoices (org_id, status, issue_date desc);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position integer not null default 0,
  kind text not null default 'other' check (kind in ('flat', 'time', 'cost', 'other')),
  description text not null default '' check (char_length(description) <= 500),
  quantity numeric(10, 2) not null default 1,
  rate numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

alter table public.time_entries add column if not exists invoice_id uuid references public.invoices (id) on delete set null;
create index if not exists time_entries_invoice_idx on public.time_entries (invoice_id);

alter table public.acct_transactions add column if not exists invoice_id uuid references public.invoices (id) on delete set null;
create index if not exists acct_transactions_invoice_idx on public.acct_transactions (invoice_id);

alter table public.acct_transactions drop constraint if exists acct_transactions_source_check;
alter table public.acct_transactions add constraint acct_transactions_source_check
  check (source in ('manual', 'receipt', 'bank_import', 'invoice'));

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists "Members manage their firm's invoices" on public.invoices;
create policy "Members manage their firm's invoices"
  on public.invoices for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

drop policy if exists "Members manage their firm's invoice lines" on public.invoice_lines;
create policy "Members manage their firm's invoice lines"
  on public.invoice_lines for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
