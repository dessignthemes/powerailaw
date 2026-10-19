-- 0044: AI Accountant is open to the whole team again (reverses 0038).
-- Everyone in the firm can read and change the firm's books; other firms still
-- can't. auth_is_owner() stays: Time Tracking (0040) still uses it.
-- Safe to run more than once.

drop policy if exists "Owner manages the firm's books" on public.acct_transactions;
drop policy if exists "Members manage their firm's books" on public.acct_transactions;
create policy "Members manage their firm's books"
  on public.acct_transactions for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
