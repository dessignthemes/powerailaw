-- 0020: manual order of task cards inside a Task Board column.
-- Tasks without a position keep their "order added" place (by created_at).
-- Safe to run more than once.

alter table public.tasks add column if not exists position double precision;

create index if not exists tasks_org_position_idx on public.tasks (org_id, position);

notify pgrst, 'reload schema';
