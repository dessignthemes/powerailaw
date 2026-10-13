-- 0032: the firm's own name for the built-in "General" board (tasks not on any
-- sub board). Empty = "General". Safe to run more than once.

alter table public.organizations add column if not exists general_board_name text;
alter table public.organizations drop constraint if exists organizations_general_board_name_check;
alter table public.organizations add constraint organizations_general_board_name_check
  check (general_board_name is null or char_length(general_board_name) between 1 and 80);

notify pgrst, 'reload schema';
