-- 0040: time entries are private. Each person sees their own; the firm owner can
-- see everyone's (members could see the whole firm's time before). Safe to run
-- more than once.

create or replace function public.auth_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;

drop policy if exists "Members can see their workspace's time" on public.time_entries;
drop policy if exists "Own time, or the owner sees everyone's" on public.time_entries;
create policy "Own time, or the owner sees everyone's"
  on public.time_entries for select
  using (org_id = auth_org_id() and (user_id = auth.uid() or auth_is_owner()));

notify pgrst, 'reload schema';
