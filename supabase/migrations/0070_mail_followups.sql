-- 0070: Email follow-up reminders. When someone sends an email from LawPower
-- that asks the recipient for something ("Please get back to me", "Please
-- forward…", "I look forward to hearing from you"), a reminder is kept for the
-- next business day. It closes by itself when the recipient replies, or when
-- the person ticks it done. Safe to run more than once.

create table if not exists public.mail_followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  provider text not null default '',          -- microsoft | google (the mailbox it was sent from)
  to_email text not null,                     -- the recipient(s), comma separated
  subject text not null default '',
  reason text not null default '',            -- the sentence that asked for something
  matter_id uuid references public.matters (id) on delete set null,
  sent_at timestamptz not null default now(),
  remind_on date not null,
  status text not null default 'open' check (status in ('open', 'done', 'replied', 'dismissed')),
  done_at timestamptz,
  checked_at timestamptz,                     -- last time the inbox was checked for a reply
  created_at timestamptz not null default now()
);
create index if not exists mail_followups_user_idx on public.mail_followups (org_id, user_id, status, remind_on);

alter table public.mail_followups enable row level security;
drop policy if exists "Members see their own follow-up reminders" on public.mail_followups;
create policy "Members see their own follow-up reminders" on public.mail_followups for all
  using (org_id = auth_org_id() and user_id = auth.uid())
  with check (org_id = auth_org_id() and user_id = auth.uid());

notify pgrst, 'reload schema';
