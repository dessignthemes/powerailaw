-- PowerAI Law — tasks (Task Board)
-- Run this in the Supabase SQL editor after 0001_init.sql.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  matter_id uuid references matters (id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'inprogress', 'waiting', 'done')),
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  assignee text,
  due_date date,
  -- [{ id, body, createdAt }]
  comments jsonb not null default '[]'::jsonb,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_org_id_idx on tasks (org_id);
create index if not exists tasks_org_due_idx on tasks (org_id, due_date);

alter table tasks enable row level security;

drop policy if exists "Members can manage tasks in their organization" on tasks;
create policy "Members can manage tasks in their organization"
  on tasks for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());
