-- 0074: a due time on tasks (optional, "HH:MM") and documents attached to a
-- task (references to the matter's documents). Safe to run more than once.

alter table public.tasks add column if not exists due_time text check (due_time is null or due_time ~ '^[0-2][0-9]:[0-5][0-9]$');
alter table public.tasks add column if not exists attachments jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
