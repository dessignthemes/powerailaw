-- 0075: "Person acting" on a matter (usually a junior associate), next to the
-- originating attorney, the person responsible (Assigned to) and the person
-- assisting (responsible_staff). Safe to run more than once.
alter table public.matters add column if not exists person_acting uuid references public.profiles (id) on delete set null;
notify pgrst, 'reload schema';
