-- LawPower AI — saved board columns
-- Run in the Supabase SQL editor after 0009_member_names_and_task_editor.sql.
--
-- Each board (and "General", board_id = null) can have its own custom
-- columns, and can rename/recolor the four standard ones. Tasks placed in a
-- custom column keep its id in tasks.column_id; deleting the column moves
-- them back to their status column.

create table if not exists board_columns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  board_id uuid references task_boards (id) on delete cascade,  -- null = General
  status text check (status in ('todo', 'inprogress', 'waiting', 'done')), -- set = a standard column's name/color
  title text not null check (char_length(title) between 1 and 60),
  color text not null default '#6B7280' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists board_columns_board_idx on board_columns (org_id, board_id, position);
create unique index if not exists board_columns_standard_idx
  on board_columns (org_id, coalesce(board_id, '00000000-0000-0000-0000-000000000000'::uuid), status)
  where status is not null;

alter table tasks add column if not exists column_id uuid references board_columns (id) on delete set null;

alter table board_columns enable row level security;
drop policy if exists "Members can manage board columns in their organization" on board_columns;
create policy "Members can manage board columns in their organization" on board_columns for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
