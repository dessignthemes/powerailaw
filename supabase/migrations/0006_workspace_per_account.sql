-- LawPower AI — one private workspace per account
-- Run in the Supabase SQL editor after 0005_ai_agent.sql.
--
-- Until now every sign-in joined one shared workspace, so all accounts saw
-- the same tasks, clients and matters. From now on each new account gets
-- its own workspace (see src/lib/data/profile.ts). This script separates the
-- accounts that already exist:
--   * The owner of each workspace (first owner, else the earliest account)
--     stays, together with all existing clients, matters, documents and
--     firm/matter memories.
--   * Every other account moves to a new workspace of its own, taking only
--     what is clearly theirs: tasks they created, their mailbox connections,
--     their general (non-matter) AI chats with messages and attachments,
--     their AI usage and their personal memories.
-- Safe to run more than once: after the first run each workspace has one
-- account, so nothing else moves.

do $$
declare
  r record;
  new_org uuid;
begin
  for r in
    select p.id, p.email, p.org_id
    from profiles p
    where p.id <> (
      select p2.id from profiles p2
      where p2.org_id = p.org_id
      order by (p2.role = 'owner') desc, p2.created_at asc, p2.id asc
      limit 1
    )
  loop
    insert into organizations (name) values (coalesce(nullif(r.email, ''), 'My workspace'))
    returning id into new_org;

    update profiles set org_id = new_org, role = 'owner' where id = r.id;

    -- Their own tasks (unlinked from the old workspace's matters).
    update tasks set org_id = new_org, matter_id = null
    where created_by = r.id and org_id = r.org_id;

    -- Their mailbox connections.
    update oauth_connections set org_id = new_org where connected_by = r.id;

    -- Their general AI chats (matter chats refer to the old workspace's
    -- matters, so they stay behind; they remain private to this user).
    update ai_conversations set org_id = new_org
    where user_id = r.id and org_id = r.org_id and matter_id is null;

    update ai_messages m set org_id = new_org
    from ai_conversations c
    where m.conversation_id = c.id and c.user_id = r.id and c.org_id = new_org;

    update ai_files f set org_id = new_org, matter_id = null
    from ai_conversations c
    where f.conversation_id = c.id and c.user_id = r.id and c.org_id = new_org;

    update ai_chunks ch set org_id = new_org
    from ai_files f
    where ch.file_id = f.id and f.user_id = r.id and f.org_id = new_org;

    update ai_pending_actions a set org_id = new_org
    from ai_conversations c
    where a.conversation_id = c.id and c.user_id = r.id and c.org_id = new_org;

    update ai_usage set org_id = new_org where user_id = r.id;

    update ai_memories set org_id = new_org
    where scope = 'personal' and user_id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
