-- 0058: Potential leads.
-- Prospective clients fill in an intake form, from the firm's website (embedded
-- form or link) or from a link the firm sends them. Each submission is a lead;
-- when the firm decides to take them on, the lead is imported into a new client
-- card in Client Intake.
-- Safe to run more than once.

-- The firm's public intake form address: lawpower.ai/intake/<intake_key>.
alter table public.organizations add column if not exists intake_key text;
update public.organizations set intake_key = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 18) where intake_key is null;
create unique index if not exists organizations_intake_key_uidx on public.organizations (intake_key);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- invited = a link was sent, nothing filled in yet; new = form received;
  -- contacted / converted (now a client) / declined are set by the firm.
  status text not null default 'new' check (status in ('invited', 'new', 'contacted', 'converted', 'declined')),
  source text not null default 'website' check (source in ('website', 'link', 'manual')),
  invite_token text unique, -- for a link sent to one person: their answers update this lead
  title text not null default '' check (char_length(title) <= 20),
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  company text not null default '' check (char_length(company) <= 160),
  email text not null default '' check (char_length(email) <= 200),
  phone text not null default '' check (char_length(phone) <= 40),
  street text not null default '' check (char_length(street) <= 200),
  city text not null default '' check (char_length(city) <= 100),
  state text not null default '' check (char_length(state) <= 40),
  zip text not null default '' check (char_length(zip) <= 20),
  matter_type text not null default '' check (char_length(matter_type) <= 80),
  description text not null default '' check (char_length(description) <= 5000),
  other_parties text not null default '' check (char_length(other_parties) <= 1000),
  preferred_contact text not null default '' check (char_length(preferred_contact) <= 40),
  best_time text not null default '' check (char_length(best_time) <= 120),
  referred_by text not null default '' check (char_length(referred_by) <= 200),
  notes text not null default '' check (char_length(notes) <= 4000), -- the firm's own notes
  client_id uuid references public.clients (id) on delete set null, -- the client card it became
  ip_hash text, -- for limiting repeated submissions (never the address itself)
  submitted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_org_idx on public.leads (org_id, created_at desc);
create index if not exists leads_ip_idx on public.leads (org_id, ip_hash, created_at desc);

alter table public.leads enable row level security;
drop policy if exists "Members manage their firm's leads" on public.leads;
create policy "Members manage their firm's leads"
  on public.leads for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Bell alert when a new lead comes in.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'matter_assigned', 'task_offered', 'task_accepted', 'portal_message', 'internal_message', 'new_lead'));

notify pgrst, 'reload schema';
