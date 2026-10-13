-- 0035: in-app alerts for team members (the bell in the top-right corner).
-- Created when someone assigns a task or a matter to a colleague.
-- Safe to run more than once.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, -- who is alerted
  kind text not null check (kind in ('task_assigned', 'matter_assigned')),
  ref_id uuid not null,                     -- the task or matter
  board_id uuid,                            -- task's board (for the link)
  title text not null default '',
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "Members see their own notifications" on public.notifications;
create policy "Members see their own notifications" on public.notifications for all
  using (org_id = auth_org_id() and user_id = auth.uid())
  with check (org_id = auth_org_id() and user_id = auth.uid());

notify pgrst, 'reload schema';
