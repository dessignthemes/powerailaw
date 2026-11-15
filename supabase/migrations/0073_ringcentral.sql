-- 0073: RingCentral, per person: texts sent from LawPower through the person's
-- RingCentral number. Tokens are encrypted by the app (INTEGRATIONS_KEY).
-- Only the server reads this table. Safe to run more than once.

create table if not exists public.ringcentral_connections (
  user_id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  from_number text,          -- the RingCentral number texts go from
  account_name text,
  connected_at timestamptz not null default now()
);

alter table public.ringcentral_connections enable row level security;
drop policy if exists "People see their own RingCentral connection" on public.ringcentral_connections;
create policy "People see their own RingCentral connection" on public.ringcentral_connections for select
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
