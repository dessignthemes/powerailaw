-- 0065: Firm-wide integrations connected with an API key (Dropbox Sign, Dropbox
-- Fax) and, later, QuickBooks. Keys are stored encrypted and are only ever
-- read by the server (no access from the browser).
-- Safe to run more than once.

create table if not exists public.org_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('dropbox_sign', 'dropbox_fax', 'quickbooks', 'remarkable')),
  secret_enc text, -- AES-256-GCM, see src/lib/integrations/store.ts
  meta jsonb not null default '{}'::jsonb, -- account name/email shown in Settings
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  unique (org_id, provider)
);

alter table public.org_integrations enable row level security;
-- No policies on purpose: only the server (service role) reads or writes these.

notify pgrst, 'reload schema';
