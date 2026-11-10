// People and companies in Records (contacts that aren't clients).

export type ContactKind = "person" | "company" | "trust" | "estate";
// Client = included in conflict checks. Vendor = title companies, law firms, lenders… the firm works with.
export type ContactCategory = "" | "client" | "vendor" | "other";

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
export const CATEGORY_NAMES: Record<Exclude<ContactCategory, "">, string> = { client: "Client", vendor: "Vendor", other: "Other" };
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
  "Court / government",
  "Other vendor",
];

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
