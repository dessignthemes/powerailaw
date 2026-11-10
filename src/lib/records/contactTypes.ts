// People and companies in Records (contacts that aren't clients).

export type ContactKind = "person" | "company" | "trust" | "estate";
// Client = included in conflict checks. Vendor = title companies, law firms, lenders… the firm works with.
// Government = courts, county clerks, townships, state agencies…
export type ContactCategory = "" | "client" | "vendor" | "government" | "other";

export type Contact = {
  id: string;
  kind: ContactKind;
  name: string;
  role: string;
  company: string; // for a person: the company they work for
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string;
  clientId: string | null;
  matterId: string | null;
  category: ContactCategory;
  vendorType: string;
  employerId: string | null; // a person who works at a company in Contacts
  shortName: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mobile: string | null;
  workPhone: string | null;
  homePhone: string | null;
  fax: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = Omit<
  Contact,
  "id" | "createdAt" | "updatedAt" | "category" | "vendorType" | "employerId" | "shortName" | "city" | "state" | "zip" | "mobile" | "workPhone" | "homePhone" | "fax"
> &
  Partial<Pick<Contact, "category" | "vendorType" | "employerId" | "shortName" | "city" | "state" | "zip" | "mobile" | "workPhone" | "homePhone" | "fax">>;

export const KIND_NAMES: Record<ContactKind, string> = { person: "Person", company: "Company", trust: "Trust", estate: "Estate" };
export const CATEGORY_NAMES: Record<Exclude<ContactCategory, "">, string> = { client: "Client", vendor: "Vendor", government: "Government", other: "Other" };
export const VENDOR_TYPES = [
  "Title company",
  "Law firm",
  "Lender / bank",
  "Real estate agency",
  "Insurance company",
  "Surveyor",
  "Appraiser",
  "Inspector",
  "Accountant",
  "Other vendor",
];

// Government offices (kept in the same "type" field as a vendor's type).
export const GOVERNMENT_TYPES = [
  "County clerk",
  "Superior court",
  "Surrogate's court",
  "Tax court",
  "Municipal court",
  "Other court",
  "Sheriff",
  "Township / municipality",
  "Tax assessor / collector",
  "County office",
  "State agency",
  "Federal agency",
  "Other government",
];

// A government office's type from its name ("" = not clearly government).
export function governmentTypeOf(name: string): string {
  const n = name.toLowerCase();
  if (/surrogate/.test(n)) return "Surrogate's court";
  if (/superior court/.test(n)) return "Superior court";
  if (/tax court/.test(n)) return "Tax court";
  if (/municipal court/.test(n)) return "Municipal court";
  if (/\bcourts?\b|\bjudiciary\b|\bchancery\b/.test(n)) return "Other court";
  if (/county clerk|clerk of|\bclerk'?s office\b|register of deeds|registrar/.test(n)) return "County clerk";
  if (/\bsheriff/.test(n)) return "Sheriff";
  if (/tax collector|tax assessor|\bassessor\b|collector of taxes/.test(n)) return "Tax assessor / collector";
  if (/^(the )?(township|borough|city|village|town) of\b|\b(township|borough) (hall|committee|council|clerk)\b/.test(n)) return "Township / municipality";
  if (/internal revenue|\birs\b|social security|\bu\.?s\.? (department|dept|citizenship|attorney)|united states|federal|\buscis\b|\bhud\b/.test(n)) return "Federal agency";
  if (/^(state of|nj |new jersey (department|division|motor|office))|department of|division of|motor vehicle|\bmvc\b/.test(n)) return "State agency";
  if (/^county of\b|\bcounty (board|office|department|planning|health)\b/.test(n)) return "County office";
  return "";
}

export const GOVERNMENT_MIGRATION = "0069_contact_government.sql";

export const PERSON_ROLES = [
  "Opposing counsel",
  "Opposing party",
  "Co-counsel",
  "Witness",
  "Expert",
  "Judge",
  "Mediator",
  "Referral source",
  "Family member",
  "Other",
];

export const COMPANY_ROLES = ["Opposing party", "Law firm", "Court", "Government agency", "Insurance company", "Bank", "Vendor", "Other"];

export const CONTACTS_MIGRATION = "0014_contacts.sql";
export const CONTACT_TYPES_MIGRATION = "0067_contact_types.sql";
