-- 0021: checklist templates for tasks (e.g. "Real Estate Purchase").
-- A template is a named list of sections with items. Applying it to a task
-- copies the items into tasks.checklist, where each item can be ticked off.
-- Safe to run more than once.

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sections jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists task_templates_org_idx on public.task_templates (org_id, name);

alter table public.task_templates enable row level security;
drop policy if exists "Members can manage task templates in their organization" on public.task_templates;
create policy "Members can manage task templates in their organization" on public.task_templates for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

alter table public.tasks add column if not exists checklist jsonb;

notify pgrst, 'reload schema';
