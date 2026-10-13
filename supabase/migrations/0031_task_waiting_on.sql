-- 0031: who a task is waiting on (client, lender, title company, seller, buyer),
-- so the Task Board can filter "Waiting on lender" etc. Empty = not waiting.
-- Safe to run more than once.

alter table public.tasks add column if not exists waiting_on text;
alter table public.tasks drop constraint if exists tasks_waiting_on_check;
alter table public.tasks add constraint tasks_waiting_on_check
  check (waiting_on is null or waiting_on in ('client', 'lender', 'title', 'seller', 'buyer'));

notify pgrst, 'reload schema';
