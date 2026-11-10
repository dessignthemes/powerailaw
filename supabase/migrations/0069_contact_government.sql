-- 0069: A "Government" group in Contacts (courts, county clerks, townships,
-- state and federal agencies), with its own types in vendor_type:
--   County clerk, Superior court, Surrogate's court, Tax court, Municipal court,
--   Other court, Sheriff, Township / municipality, Tax assessor / collector,
--   County office, State agency, Federal agency, Other government.
-- Existing cards that are clearly government move to the new group.
-- Needs 0067. Safe to run more than once.

alter table public.contacts drop constraint if exists contacts_category_check;
alter table public.contacts add constraint contacts_category_check check (category in ('', 'client', 'vendor', 'government', 'other'));

-- Government offices among existing companies: anything imported as
-- "Court / government", and names that clearly say so. Clients stay clients.
with g as (
  select id,
    case
      when name ~* 'surrogate' then 'Surrogate''s court'
      when name ~* 'superior court' then 'Superior court'
      when name ~* 'tax court' then 'Tax court'
      when name ~* 'municipal court' then 'Municipal court'
      when name ~* '\mcourts?\M|\mjudiciary\M|\mchancery\M' then 'Other court'
      when name ~* 'county clerk|clerk of|\mclerk''?s office\M|register of deeds|registrar' then 'County clerk'
      when name ~* '\msheriff' then 'Sheriff'
      when name ~* 'tax collector|tax assessor|\massessor\M|collector of taxes' then 'Tax assessor / collector'
      when name ~* '^(the )?(township|borough|city|village|town) of\M|\m(township|borough) (hall|committee|council|clerk)\M' then 'Township / municipality'
      when name ~* 'internal revenue|\mirs\M|social security|united states|federal|\muscis\M|\mhud\M' then 'Federal agency'
      when name ~* '^(state of|nj |new jersey (department|division|motor|office))|department of|division of|motor vehicle|\mmvc\M' then 'State agency'
      when name ~* '^county of\M|\mcounty (board|office|department|planning|health)\M' then 'County office'
      when vendor_type = 'Court / government' then 'Other government'
      else null
    end as gov_type
  from public.contacts
  where kind <> 'person' and category <> 'client'
    and vendor_type in ('', 'Court / government', 'Other vendor') -- a law firm or realtor named "… Court …" stays as it is
)
update public.contacts c
set category = 'government', vendor_type = g.gov_type, updated_at = now()
from g
where c.id = g.id and g.gov_type is not null and c.category <> 'government';

-- People who work at a government office belong to it too (unless they're clients).
update public.contacts p
set category = 'government', vendor_type = e.vendor_type, updated_at = now()
from public.contacts e
where p.employer_id = e.id and e.category = 'government' and p.category in ('', 'vendor', 'other') and p.category <> 'government';

notify pgrst, 'reload schema';
