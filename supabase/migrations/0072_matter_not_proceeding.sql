-- 0072: "Not proceeding" matter status, an optional reason, and when a matter's
-- status last changed / when it closed (for Reports). Safe to run more than once.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.matters'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%Lead%'
  loop
    execute format('alter table public.matters drop constraint %I', c);
  end loop;
end $$;
alter table public.matters add constraint matters_status_check
  check (status in ('Lead', 'Consultation', 'Engaged', 'Active', 'Closed', 'Not proceeding'));

alter table public.matters add column if not exists not_proceeding_reason text;
alter table public.matters add column if not exists status_changed_at timestamptz;
alter table public.matters add column if not exists closed_at timestamptz;

-- Matters already closed: their last update is the best guess for when.
update public.matters set closed_at = updated_at where status = 'Closed' and closed_at is null;

notify pgrst, 'reload schema';
