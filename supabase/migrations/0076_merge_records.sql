-- 0076: merge two duplicate records (matters, client cards or contacts).
--
-- merge_records(kind, org, keep, drop) moves everything that points at the
-- record being removed (tasks, documents, folders, emails, texts, time,
-- invoices, people on the matter…) over to the record that's kept, fills the
-- kept record's empty fields from the removed one, then removes it. All in one
-- transaction: it either all happens or nothing does.
--
-- "Everything that points at it" is found from the database itself (every
-- foreign key to the table, plus any uuid column named matter_id / client_id /
-- contact_id), so tables added later are covered without changing this.
-- Where moving a row would break a "one per matter" rule (e.g. the same person
-- linked to both matters), the removed record's copy is dropped.
--
-- Called only by the server (service role) after it has checked the user's
-- firm. Safe to run twice.

create or replace function public.merge_records(p_kind text, p_org uuid, p_keep uuid, p_drop uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_col text;
  ref record;
  r record;
  c record;
  moved int;
  total int := 0;
  detail jsonb := '{}'::jsonb;
  keep_row jsonb;
  drop_row jsonb;
  sets text := '';
begin
  if p_kind not in ('matters', 'clients', 'contacts') then
    raise exception 'Unknown record type: %', p_kind;
  end if;
  if p_keep = p_drop then
    raise exception 'Pick two different records to merge.';
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 and org_id = $2 for update', p_kind) into keep_row using p_keep, p_org;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and org_id = $2 for update', p_kind) into drop_row using p_drop, p_org;
  if keep_row is null or drop_row is null then
    raise exception 'One of the records wasn''t found in your firm.';
  end if;

  ref_col := case p_kind when 'matters' then 'matter_id' when 'clients' then 'client_id' else 'contact_id' end;

  -- 1. Point everything at the kept record.
  for ref in
    select distinct ns.nspname::text as sch, cl.relname::text as tab, att.attname::text as col
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = format('public.%I', p_kind)::regclass
       and array_length(con.conkey, 1) = 1
    union
    select col.table_schema::text, col.table_name::text, col.column_name::text
      from information_schema.columns col
      join information_schema.tables t on t.table_schema = col.table_schema and t.table_name = col.table_name and t.table_type = 'BASE TABLE'
     where col.table_schema = 'public' and col.data_type = 'uuid' and col.column_name = ref_col
  loop
    moved := 0;
    begin
      execute format('update %I.%I set %I = $1 where %I = $2', ref.sch, ref.tab, ref.col, ref.col) using p_keep, p_drop;
      get diagnostics moved = row_count;
    exception when unique_violation then
      -- One row at a time; a row that would duplicate one the kept record already has is dropped.
      moved := 0;
      for r in execute format('select ctid as rid from %I.%I where %I = $1', ref.sch, ref.tab, ref.col) using p_drop loop
        begin
          execute format('update %I.%I set %I = $1 where ctid = $2', ref.sch, ref.tab, ref.col) using p_keep, r.rid;
          moved := moved + 1;
        exception when unique_violation then
          execute format('delete from %I.%I where ctid = $1', ref.sch, ref.tab) using r.rid;
        end;
      end loop;
    end;
    if moved > 0 then
      detail := detail || jsonb_build_object(ref.tab, coalesce((detail ->> ref.tab)::int, 0) + moved);
      total := total + moved;
    end if;
  end loop;

  -- A contact that worked "at" the removed company now works at the kept one;
  -- the kept record can't be its own employer.
  if p_kind = 'contacts' then
    update public.contacts set employer_id = null where id = p_keep and employer_id = p_keep;
  end if;

  -- 2. Remove the duplicate (nothing points at it any more).
  execute format('delete from public.%I where id = $1', p_kind) using p_drop;

  -- 3. Fill the kept record's empty fields from the removed one. Notes and
  -- descriptions that differ are kept both; details (json) are combined, the
  -- kept record's values winning.
  for c in
    select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as typ
      from pg_attribute a
     where a.attrelid = format('public.%I', p_kind)::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '' and a.attidentity = ''
       and a.attname not in ('id', 'org_id', 'created_at', 'updated_at', 'created_by')
  loop
    if c.typ = 'jsonb' then
      sets := sets || format(
        ', %1$I = case when jsonb_typeof(k.%1$I) = ''object'' and jsonb_typeof(d.%1$I) = ''object'' then d.%1$I || k.%1$I '
        || 'when k.%1$I is null or k.%1$I in (''[]''::jsonb, ''{}''::jsonb, ''null''::jsonb) then d.%1$I else k.%1$I end', c.name);
    elsif c.typ in ('text', 'character varying') and c.name in ('notes', 'description', 'private_notes') then
      sets := sets || format(
        ', %1$I = case when coalesce(k.%1$I, '''') = '''' then d.%1$I when coalesce(d.%1$I, '''') = '''' or d.%1$I = k.%1$I then k.%1$I '
        || 'else k.%1$I || E''\n\n'' || d.%1$I end', c.name);
    elsif c.typ in ('text', 'character varying') then
      sets := sets || format(', %1$I = coalesce(nullif(k.%1$I, ''''), d.%1$I)', c.name);
    else
      sets := sets || format(', %1$I = coalesce(k.%1$I, d.%1$I)', c.name);
    end if;
  end loop;
  if sets <> '' then
    execute format(
      'update public.%1$I k set %2$s from jsonb_populate_record(null::public.%1$I, $1) d where k.id = $2',
      p_kind, substr(sets, 3)
    ) using drop_row, p_keep;
  end if;

  return jsonb_build_object('moved', total, 'tables', detail);
end;
$$;

revoke all on function public.merge_records(text, uuid, uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.merge_records(text, uuid, uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.merge_records(text, uuid, uuid, uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.merge_records(text, uuid, uuid, uuid) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
