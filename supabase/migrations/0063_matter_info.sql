-- 0063: More matter details, entered in the New matter window (and editable on
-- the matter's Details tab): responsible / originating attorney, responsible
-- staff, client reference number, location, open / pending / closed dates,
-- statute of limitations, and the minimum trust balance.
-- Safe to run more than once.

alter table public.matters add column if not exists originating_attorney uuid references public.profiles (id) on delete set null;
alter table public.matters add column if not exists responsible_staff uuid references public.profiles (id) on delete set null;
alter table public.matters add column if not exists client_reference text not null default '' check (char_length(client_reference) <= 100);
alter table public.matters add column if not exists location text not null default '' check (char_length(location) <= 200);
alter table public.matters add column if not exists open_date date;
alter table public.matters add column if not exists pending_date date;
alter table public.matters add column if not exists closed_date date;
alter table public.matters add column if not exists sol_date date;
alter table public.matters add column if not exists sol_satisfied boolean not null default false;
alter table public.matters add column if not exists trust_minimum numeric(14, 2) check (trust_minimum is null or (trust_minimum >= 0 and trust_minimum < 1000000000));

notify pgrst, 'reload schema';
