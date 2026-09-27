-- LawPower AI — member names (for initials) and who last changed a task
-- Run in the Supabase SQL editor after 0008_task_boards.sql.

-- Filled from the person's Google / Microsoft profile at each sign-in.
alter table profiles add column if not exists full_name text;

-- Who created a task already exists (tasks.created_by); this records who
-- last edited it, for "Updated task …" in Recent activity.
alter table tasks add column if not exists updated_by uuid references profiles (id) on delete set null;

notify pgrst, 'reload schema';
