-- LawPower AI — Records: people and companies (contacts that aren't clients,
-- such as opposing counsel, witnesses, experts, courts and vendors).
-- Safe to run more than once. Run after 0013_document_file_types.sql.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('person', 'company')),
  name text not null check (char_length(name) between 1 and 200),
  role text not null default '',
  company text not null default '',
  email text,
  phone text,
  address text,
  notes text not null default '',
  client_id uuid references clients (id) on delete set null,
  matter_id uuid references matters (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_org_idx on contacts (org_id, updated_at desc);
create index if not exists contacts_matter_idx on contacts (matter_id);
create index if not exists contacts_client_idx on contacts (client_id);

alter table contacts enable row level security;

drop policy if exists "Members can manage contacts in their organization" on contacts;
create policy "Members can manage contacts in their organization"
  on contacts for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
