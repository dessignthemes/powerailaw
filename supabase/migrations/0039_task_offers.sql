-- 0039: offering a task to several people (the first to accept takes it), the
-- assigner's instructions, and who assigned it. Alerts for offers and acceptances.
-- Safe to run more than once.

alter table public.tasks add column if not exists offered_to text[] not null default '{}';
alter table public.tasks add column if not exists instructions text not null default '';
alter table public.tasks add column if not exists assigned_by text;
alter table public.tasks drop constraint if exists tasks_instructions_check;
alter table public.tasks add constraint tasks_instructions_check check (char_length(instructions) <= 5000);
create index if not exists tasks_offered_idx on public.tasks using gin (offered_to);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'matter_assigned', 'task_offered', 'task_accepted'));

notify pgrst, 'reload schema';
