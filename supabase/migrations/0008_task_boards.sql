-- LawPower AI — sub boards under the Task Board
-- Run in the Supabase SQL editor after 0007_workspace_invites.sql.
--
-- A workspace can have named sub boards (e.g. "Email Tasks", "Real Estate").
-- Tasks with board_id = null live on the main Task Board. Deleting a sub
-- board moves its tasks back to the main board rather than deleting them.

create table if not exists task_boards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position integer not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists task_boards_org_idx on task_boards (org_id, position);

alter table tasks add column if not exists board_id uuid references task_boards (id) on delete set null;
create index if not exists tasks_board_idx on tasks (org_id, board_id);

alter table task_boards enable row level security;
drop policy if exists "Members can manage task boards in their organization" on task_boards;
create policy "Members can manage task boards in their organization" on task_boards for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
