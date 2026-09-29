// People and companies in Records (contacts that aren't clients).

export type ContactKind = "person" | "company";

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
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

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
