-- LawPower AI — Client Intake: full client cards (people or company, contact
-- details, letter salutations, addresses, notes, bank details, labels).
-- Safe to run more than once. Run after 0017_ai_accountant.sql.
--
-- The card lives on the existing clients row, so Clients, Records and Matters
-- keep working with the same client. Row-level security is unchanged.

alter table clients add column if not exists card_type text not null default 'person';
alter table clients drop constraint if exists clients_card_type_check;
alter table clients add constraint clients_card_type_check check (card_type in ('person', 'company'));

alter table clients add column if not exists profile jsonb not null default '{}'::jsonb;

-- Companies created before this migration become company cards.
update clients set card_type = 'company' where type = 'Legal entity' and card_type = 'person' and profile = '{}'::jsonb;

notify pgrst, 'reload schema';
