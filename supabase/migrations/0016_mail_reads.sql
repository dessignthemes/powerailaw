-- LawPower AI — Inbox: remember which emails a person opened in LawPower.
-- Safe to run more than once. Run after 0015_dropbox.sql.
--
-- The mailbox stays read-only (LawPower never changes Outlook or Gmail), so
-- opened emails are recorded here instead. Each person only sees their own.

create table if not exists mail_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  message_id text not null check (char_length(message_id) between 1 and 500),
  read_at timestamptz not null default now(),
  primary key (user_id, provider, message_id)
);

create index if not exists mail_reads_read_at_idx on mail_reads (user_id, read_at desc);

alter table mail_reads enable row level security;

drop policy if exists "Users manage their own mail reads" on mail_reads;
create policy "Users manage their own mail reads"
  on mail_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
