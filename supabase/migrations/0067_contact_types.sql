-- 0067: Contact types and groups.
--   kind:        person | company | trust | estate
--   category:    '' (not set) | client | vendor | other   (clients are included in conflict checks)
--   vendor_type: Title company, Law firm, Lender, Real estate agency, Insurance company, Surveyor… (free text)
--   employer_id: a person who works at a company in Contacts (employees listed under their company)
--   short_name, city, state, zip, mobile, work_phone, home_phone, fax: from imported card lists (Excel / Cards)
-- Safe to run more than once.

alter table public.contacts drop constraint if exists contacts_kind_check;
alter table public.contacts add constraint contacts_kind_check check (kind in ('person', 'company', 'trust', 'estate'));

alter table public.contacts add column if not exists category text not null default '';
alter table public.contacts drop constraint if exists contacts_category_check;
alter table public.contacts add constraint contacts_category_check check (category in ('', 'client', 'vendor', 'other'));

alter table public.contacts add column if not exists vendor_type text not null default '';
alter table public.contacts add column if not exists employer_id uuid references public.contacts (id) on delete set null;
alter table public.contacts add column if not exists short_name text not null default '';
alter table public.contacts add column if not exists city text;
alter table public.contacts add column if not exists state text;
alter table public.contacts add column if not exists zip text;
alter table public.contacts add column if not exists mobile text;
alter table public.contacts add column if not exists work_phone text;
alter table public.contacts add column if not exists home_phone text;
alter table public.contacts add column if not exists fax text;

create index if not exists contacts_category_idx on public.contacts (org_id, category);
create index if not exists contacts_employer_idx on public.contacts (employer_id);
create index if not exists contacts_external_idx on public.contacts (org_id, source, external_id);

-- RLS stays as before: members manage contacts in their own organization (0014).

notify pgrst, 'reload schema';
