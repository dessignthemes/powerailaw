-- LawPower AI — Triage: turn emails from a chosen mail folder into tasks
-- Run in the Supabase SQL editor after 0010_board_columns.sql.
--
-- Each person picks one folder in their own mailbox to watch (stored on
-- their profile). LawPower only reads that folder; emails are never moved
-- or changed. triage_items remembers which emails became a task or were
-- dismissed, so they drop out of the list.

alter table profiles add column if not exists triage_provider text check (triage_provider in ('google', 'microsoft'));
alter table profiles add column if not exists triage_folder_id text;
alter table profiles add column if not exists triage_folder_name text;

create table if not exists triage_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  message_id text not null check (char_length(message_id) between 1 and 400),
  status text not null check (status in ('task', 'dismissed')),
  task_id uuid, -- the task created from this email (no FK: the task may be saved a moment later)
  created_at timestamptz not null default now(),
  unique (user_id, provider, message_id)
);

alter table triage_items enable row level security;
drop policy if exists "People can manage their own triage items" on triage_items;
create policy "People can manage their own triage items" on triage_items for all
  using (user_id = auth.uid() and org_id = auth_org_id())
  with check (user_id = auth.uid() and org_id = auth_org_id());

notify pgrst, 'reload schema';
