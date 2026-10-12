-- 0027: emails and text messages logged on a matter (the matter's Emails tab).
--
-- An email gets here when someone tags it to the matter from the Inbox, when
-- its subject carries the matter number (e.g. "[REP-2026-0001]", which every
-- email written from the matter has, so replies match too), or when it's in
-- an email thread already tagged to the matter. Text messages are logged from
-- the matter. The mailbox itself is never changed.
-- Safe to run more than once.

create table if not exists public.matter_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  matter_id uuid not null references public.matters (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'sms')),
  direction text not null default 'in' check (direction in ('in', 'out')),
  source text not null default 'tagged' check (source in ('tagged', 'number', 'thread', 'logged')),
  provider text check (provider in ('google', 'microsoft')),
  mailbox_user_id uuid references public.profiles (id) on delete set null,
  mailbox_email text,
  message_id text check (message_id is null or char_length(message_id) <= 500),
  thread_id text check (thread_id is null or char_length(thread_id) <= 500),
  subject text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  to_text text not null default '',
  cc_text text not null default '',
  phone text,
  sent_at timestamptz not null default now(),
  snippet text not null default '',
  body_text text,
  web_link text,
  has_attachments boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One email belongs to one matter (re-tagging moves it).
create unique index if not exists matter_messages_email_uidx
  on public.matter_messages (org_id, provider, message_id) where message_id is not null;
create index if not exists matter_messages_matter_idx on public.matter_messages (org_id, matter_id, sent_at desc);
create index if not exists matter_messages_thread_idx on public.matter_messages (org_id, provider, thread_id) where thread_id is not null;

alter table public.matter_messages enable row level security;
drop policy if exists "Members can manage matter messages in their organization" on public.matter_messages;
create policy "Members can manage matter messages in their organization" on public.matter_messages for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
