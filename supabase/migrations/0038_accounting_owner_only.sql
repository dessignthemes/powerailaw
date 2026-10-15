-- 0038: AI Accountant is the firm owner's. Only the workspace owner can read or
-- change the firm's books (members had access before). The receipts bucket is
-- already private (server only). Safe to run more than once.

-- Is the signed-in person the owner of their workspace?
create or replace function public.auth_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;

drop policy if exists "Members manage their firm's books" on public.acct_transactions;
drop policy if exists "Owner manages the firm's books" on public.acct_transactions;
create policy "Owner manages the firm's books"
  on public.acct_transactions for all
  using (org_id = auth_org_id() and auth_is_owner())
  with check (org_id = auth_org_id() and auth_is_owner());

notify pgrst, 'reload schema';
