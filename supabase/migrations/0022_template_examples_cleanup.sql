-- 0022: Real Estate workflows are now built-in example templates in the app
-- (every firm sees "Real Estate Purchase Workflow" and "Real Estate Sale Workflow").
-- This removes the copies saved from the old starter buttons, and the old
-- simple "Real Estate Purchase" template. Checklists already added to tasks
-- are kept; only their " [NJ]" label is dropped. Safe to run more than once.

delete from public.task_templates
where name in ('Real Estate Purchase', 'Real Estate Purchase Workflow [NJ]', 'Real Estate Sale Workflow [NJ]');

update public.tasks
set checklist = replace(checklist::text, ' [NJ]', '')::jsonb
where checklist is not null and checklist::text like '%[NJ]%';

notify pgrst, 'reload schema';
