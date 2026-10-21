-- 0047: People and companies on a matter, with their role.
-- A contact (from Contacts) or a client can be on many matters, and a matter
-- can have many: realtor, seller's attorney, lender, title company, executor…
-- Each link is either a contact or a client, never both.
-- Contacts that were tied to one matter before (contacts.matter_id) are copied in.
-- Safe to run more than once.

create table if not exists public.matter_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  matter_id uuid not null references public.matters (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  role text not null default '' check (char_length(role) <= 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint matter_contacts_one_target check ((contact_id is null) <> (client_id is null))
);

create unique index if not exists matter_contacts_contact_uidx on public.matter_contacts (matter_id, contact_id) where contact_id is not null;
create unique index if not exists matter_contacts_client_uidx on public.matter_contacts (matter_id, client_id) where client_id is not null;
create index if not exists matter_contacts_org_matter_idx on public.matter_contacts (org_id, matter_id);
create index if not exists matter_contacts_contact_idx on public.matter_contacts (contact_id);
create index if not exists matter_contacts_client_idx on public.matter_contacts (client_id);

-- Earlier one-matter links.
insert into public.matter_contacts (org_id, matter_id, contact_id, role)
select c.org_id, c.matter_id, c.id, coalesce(c.role, '')
from public.contacts c
where c.matter_id is not null
  and not exists (select 1 from public.matter_contacts mc where mc.matter_id = c.matter_id and mc.contact_id = c.id);

alter table public.matter_contacts enable row level security;

drop policy if exists "Members manage their firm's matter contacts" on public.matter_contacts;
create policy "Members manage their firm's matter contacts"
  on public.matter_contacts for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
