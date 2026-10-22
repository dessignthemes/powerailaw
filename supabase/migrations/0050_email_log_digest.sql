-- 0050: Emails LawPower sends itself (task assignments, the 9 AM check-in).
--   email_log               every email sent or attempted, for the record
--   profiles.daily_digest   the morning check-in email can be turned off per person
-- Safe to run more than once.

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  to_email text not null,
  kind text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_org_idx on public.email_log (org_id, created_at desc);
alter table public.email_log enable row level security;
drop policy if exists "Members see their firm's email log" on public.email_log;
create policy "Members see their firm's email log" on public.email_log for select using (org_id = auth_org_id());

alter table public.profiles add column if not exists daily_digest boolean not null default true;

notify pgrst, 'reload schema';
