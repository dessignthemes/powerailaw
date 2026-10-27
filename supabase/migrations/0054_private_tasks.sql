-- 0054: Private tasks. A private task is visible only to the person who created
-- it and the person it's assigned (or offered) to; nobody else in the firm.
-- LawPower's server enforces this; this rule also guards the database itself.
-- Safe to run more than once.

alter table public.tasks add column if not exists is_private boolean not null default false;
create index if not exists tasks_private_idx on public.tasks (org_id) where is_private;

drop policy if exists "Members can manage tasks in their organization" on public.tasks;
create policy "Members can manage tasks in their organization"
  on public.tasks for all
  using (
    org_id = auth_org_id()
    and (
      not is_private
      or created_by = auth.uid()
      or lower(coalesce(assignee, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(coalesce(assigned_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(coalesce(auth.jwt() ->> 'email', '')) = any (offered_to)
    )
  )
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
