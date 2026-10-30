-- 0062: Change a matter's number (the pencil next to the number on the matter page).
-- Until now a matter kept its number for life; now a deliberate change is
-- allowed. Updates that don't set a new number still keep the old one, and
-- numbers stay unique per firm (matters_org_number_uidx).
-- Safe to run more than once.

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
  -- A matter keeps its number, unless someone deliberately gives it a new one
  -- (the pencil next to the number on the matter page).
  if tg_op = 'UPDATE' and old.matter_number is not null then
    if new.matter_number is null or new.matter_number = old.matter_number then
      new.matter_number := old.matter_number;
      new.matter_seq := old.matter_seq;
      new.matter_code := old.matter_code;
    else
      new.matter_code := split_part(new.matter_number, '-', 1);
      new.matter_seq := case when split_part(new.matter_number, '-', 3) ~ '^[0-9]{1,9}$' then split_part(new.matter_number, '-', 3)::int else old.matter_seq end;
    end if;
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

notify pgrst, 'reload schema';
