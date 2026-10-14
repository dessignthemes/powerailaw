-- 0036: each board's own quick filters ("+ Add more" on the Task Board), and
-- "Waiting on" can be any party a firm uses (not only client/lender/title/seller/buyer).
-- Safe to run more than once.

alter table public.organizations add column if not exists board_filters jsonb not null default '{}'::jsonb;

alter table public.tasks drop constraint if exists tasks_waiting_on_check;
alter table public.tasks add constraint tasks_waiting_on_check
  check (waiting_on is null or char_length(waiting_on) between 1 and 60);

notify pgrst, 'reload schema';
