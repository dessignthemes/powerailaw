-- 0037: per-person email marks kept in LawPower (the mailbox connection is
-- read-only): flagged as important, and "mark as unread" (cleared when the
-- email is opened again). Safe to run more than once.

create table if not exists public.mail_marks (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  message_id text not null check (char_length(message_id) between 1 and 500),
  flagged boolean not null default false,
  unread boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, message_id)
);
create index if not exists mail_marks_flagged_idx on public.mail_marks (user_id, provider) where flagged;

alter table public.mail_marks enable row level security;
drop policy if exists "Users manage their own mail marks" on public.mail_marks;
create policy "Users manage their own mail marks" on public.mail_marks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
