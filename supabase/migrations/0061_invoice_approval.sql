-- 0061: Invoice approval.
-- An invoice can be a draft, wait for the managing attorney's approval
-- (owner or admin), and only then be issued (unpaid → paid). Invoices created
-- before this stay as they are (already issued).
-- Safe to run more than once.

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'pending', 'unpaid', 'partial', 'paid', 'void'));

alter table public.invoices add column if not exists submitted_by uuid references public.profiles (id) on delete set null;
alter table public.invoices add column if not exists submitted_at timestamptz;
alter table public.invoices add column if not exists approved_by uuid references public.profiles (id) on delete set null;
alter table public.invoices add column if not exists approved_at timestamptz;
alter table public.invoices add column if not exists review_note text not null default '' check (char_length(review_note) <= 1000);

-- Bell alert to the owner / admins when an invoice is sent for approval, and to
-- the sender when it's approved or sent back.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'matter_assigned', 'task_offered', 'task_accepted', 'portal_message', 'internal_message', 'new_lead', 'invoice_approval'));

notify pgrst, 'reload schema';
