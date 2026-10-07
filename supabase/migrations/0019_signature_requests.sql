-- LawPower AI — Send for signature: a client signs a PDF through a private
-- link; the signed copy (with an audit page) is saved as a new version.
-- Safe to run more than once. Run after 0018_client_cards.sql.

create table if not exists signature_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  version_id uuid not null references document_versions (id) on delete cascade,
  matter_id uuid not null references matters (id) on delete cascade,
  created_by uuid references profiles (id) on delete set null,
  created_by_email text,
  signer_name text not null check (char_length(signer_name) between 1 and 200),
  signer_email text not null check (char_length(signer_email) between 3 and 320),
  message text not null default '' check (char_length(message) <= 2000),
  -- Only a SHA-256 hash of the signing link's secret is stored.
  token_hash text not null unique,
  status text not null default 'sent' check (status in ('sent', 'viewed', 'signed', 'declined', 'cancelled')),
  fields jsonb not null default '[]'::jsonb,
  field_values jsonb not null default '{}'::jsonb,
  decline_reason text,
  signed_version_id uuid references document_versions (id) on delete set null,
  original_sha256 text,
  signer_ip text,
  signer_user_agent text,
  viewed_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signature_requests_doc_idx on signature_requests (org_id, document_id, created_at desc);

-- Members manage their own workspace's requests. Signers never query the
-- table directly: the public signing API checks the link's secret.
alter table signature_requests enable row level security;
drop policy if exists "Members manage their firm's signature requests" on signature_requests;
create policy "Members manage their firm's signature requests"
  on signature_requests for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
