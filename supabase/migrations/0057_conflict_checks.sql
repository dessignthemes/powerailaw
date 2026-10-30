-- 0057: Conflict checks.
-- When a new client is added (or someone runs a check by hand), LawPower looks
-- for the person or company in every matter, whatever its status (lead, open,
-- closed): clients, the other side (seller, buyer, other party, counterparty),
-- attorneys, realtors and matter contacts. The AI reviews the possible matches
-- and says which matter, which role, and whether it looks adverse. A person then
-- marks the check Cleared or Conflict.
-- Safe to run more than once.

create table if not exists public.conflict_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null, -- the new client this check was for, if any
  label text not null default '' check (char_length(label) <= 300), -- who was checked, e.g. "Jan Kowalski"
  searched jsonb not null default '{}'::jsonb, -- names, emails, phones that were looked for
  result text not null default 'clear' check (result in ('clear', 'review', 'conflict')),
  summary text not null default '' check (char_length(summary) <= 4000),
  hits jsonb not null default '[]'::jsonb, -- the matters and roles found, with the AI's reason
  ai_used boolean not null default true,
  matters_checked integer not null default 0,
  decision text check (decision in ('cleared', 'conflict')),
  decision_note text not null default '' check (char_length(decision_note) <= 2000),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conflict_checks_org_idx on public.conflict_checks (org_id, created_at desc);
create index if not exists conflict_checks_client_idx on public.conflict_checks (client_id, created_at desc);

alter table public.conflict_checks enable row level security;

drop policy if exists "Members see their firm's conflict checks" on public.conflict_checks;
create policy "Members see their firm's conflict checks"
  on public.conflict_checks for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- AI usage: conflict checks are counted as their own feature.
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('chat', 'documents', 'matter_review', 'accounting', 'conflicts', 'other'));

notify pgrst, 'reload schema';
