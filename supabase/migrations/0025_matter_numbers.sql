-- 0025: matter numbers like REP-2026-0001, and templates linked to matter codes.
--
--   REP   = the abbreviation the firm picks when creating the matter
--   2026  = the year the matter was created (firm's timezone)
--   0001  = the firm's running matter number; each new matter gets the next one
--
-- The number is given by the database when the matter is saved, so two people
-- creating matters at the same time never get the same number. Once a matter
-- has a number it never changes. Older matters get a number the first time an
-- abbreviation is set on them.
--
-- organizations.matter_number_start lets a firm continue its old numbering
-- (e.g. set it to 1250 so the next matter is ...-1250).
--
-- task_templates.matter_codes says which matters a template is for (e.g. {REP}),
-- so the matter's Tasks tab can suggest it.
--
-- Safe to run more than once.

alter table public.matters add column if not exists matter_code text;
alter table public.matters add column if not exists matter_seq integer;
alter table public.matters add column if not exists matter_number text;

alter table public.matters drop constraint if exists matters_matter_code_format;
alter table public.matters add constraint matters_matter_code_format
  check (matter_code is null or matter_code ~ '^[A-Z][A-Z0-9]{1,5}$');

create unique index if not exists matters_org_seq_uidx on public.matters (org_id, matter_seq) where matter_seq is not null;
create unique index if not exists matters_org_number_uidx on public.matters (org_id, matter_number) where matter_number is not null;

alter table public.organizations add column if not exists matter_number_start integer not null default 1;

create or replace function public.assign_matter_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tz text;
  yr int;
  next_seq int;
  start_at int;
begin
  -- A matter keeps its number for life.
  if tg_op = 'UPDATE' and old.matter_number is not null then
    new.matter_number := old.matter_number;
    new.matter_seq := old.matter_seq;
    new.matter_code := old.matter_code;
    return new;
  end if;

  if new.matter_code is null or new.matter_number is not null then
    return new;
  end if;

  new.matter_code := upper(new.matter_code);

  -- One matter number at a time per firm.
  perform pg_advisory_xact_lock(hashtextextended('matter_number:' || new.org_id::text, 0));

  select coalesce(o.timezone, 'America/New_York'), coalesce(o.matter_number_start, 1)
    into tz, start_at
    from organizations o where o.id = new.org_id;
  tz := coalesce(tz, 'America/New_York');
  start_at := coalesce(start_at, 1);

  select greatest(coalesce(max(m.matter_seq), 0) + 1, start_at)
    into next_seq
    from matters m where m.org_id = new.org_id;

  yr := extract(year from (coalesce(new.created_at, now()) at time zone tz))::int;

  new.matter_seq := next_seq;
  new.matter_number := new.matter_code || '-' || yr::text || '-' || (case when next_seq < 10000 then lpad(next_seq::text, 4, '0') else next_seq::text end);
  return new;
end;
$$;

drop trigger if exists matters_assign_number on public.matters;
create trigger matters_assign_number
  before insert or update on public.matters
  for each row execute function public.assign_matter_number();

alter table public.task_templates add column if not exists matter_codes text[] not null default '{}';

notify pgrst, 'reload schema';
