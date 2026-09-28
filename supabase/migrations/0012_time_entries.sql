-- LawPower AI — time tracking
-- Run in the Supabase SQL editor after 0011_triage.sql.
--
-- Time entries belong to the workspace (so a team can see its timesheet)
-- and record who worked, when, how long, and on which matter / task.

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  entry_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  minutes integer not null check (minutes between 1 and 1440),
  description text not null default '' check (char_length(description) <= 2000),
  matter_id uuid references matters (id) on delete set null,
  task_id uuid references tasks (id) on delete set null,
  billable boolean not null default true,
  rate_cents integer check (rate_cents between 0 and 10000000),
  source text not null default 'manual' check (source in ('manual', 'timer')),
  created_at timestamptz not null default now()
);
create index if not exists time_entries_org_date_idx on time_entries (org_id, entry_date);
create index if not exists time_entries_task_idx on time_entries (task_id);

alter table time_entries enable row level security;
drop policy if exists "Members can see their workspace's time" on time_entries;
create policy "Members can see their workspace's time" on time_entries for select using (org_id = auth_org_id());
drop policy if exists "People manage their own time entries" on time_entries;
create policy "People manage their own time entries" on time_entries for all
  using (org_id = auth_org_id() and user_id = auth.uid())
  with check (org_id = auth_org_id() and user_id = auth.uid());

notify pgrst, 'reload schema';
