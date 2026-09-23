-- PowerAI Law — mailbox connections belong to the person who connected them
-- Run this in the Supabase SQL editor after 0003_documents.sql.
--
-- 0001 allowed one Google/Microsoft connection per organization, so every
-- login overwrote the firm's single token and everyone would have read the
-- last person's mailbox. Connections are now one per user per provider,
-- and only that user's Inbox reads them.

alter table oauth_connections add column if not exists account_email text;
alter table oauth_connections add column if not exists updated_at timestamptz not null default now();

alter table oauth_connections drop constraint if exists oauth_connections_org_id_provider_key;

-- Rows with no owner can't be attributed to anyone; drop them.
delete from oauth_connections where connected_by is null;

create unique index if not exists oauth_connections_user_provider_idx
  on oauth_connections (connected_by, provider);

drop policy if exists "Members can manage oauth connections in their organization" on oauth_connections;
drop policy if exists "Users can manage their own oauth connections" on oauth_connections;
create policy "Users can manage their own oauth connections"
  on oauth_connections for all
  using (connected_by = auth.uid())
  with check (connected_by = auth.uid());

notify pgrst, 'reload schema';
