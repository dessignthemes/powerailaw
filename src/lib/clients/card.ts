// Client card (Client Intake): shared by the page and the server.

export type CardType = "person" | "company";
export type ContactKind = "Email" | "Phone" | "Cell" | "Fax" | "Web" | "Other";
export type ContactLine = { kind: ContactKind; value: string };

export type Person = {
  id: string;
  title: string; // Mr., Mrs., Ms., Dr. …
  first: string;
  middle: string;
  last: string;
  previousNames: string;
  suffix: string;
  gender: "" | "Male" | "Female" | "Other";
  relationship: string;
  contacts: ContactLine[];
  dob: string; // YYYY-MM-DD
  placeOfBirth: string;
  countryOfBirth: string;
  nationality: string;
  dod: string;
  placeOfDeath: string;
  occupation: string;
  employer: string;
  education: string;
  ssnLast4: string;
  driversLicense: string;
  preferredLanguage: string;
  extra: { label: string; value: string }[];
};

export type Address = {
  building: string;
  aptType: string;
  aptNo: string;
  street: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  zip4: string;
  country: string;
  instructions: string;
};

export type Profile = {
  people: Person[];
  company: { name: string; legalName: string; entityType: string; ein: string; website: string; contacts: ContactLine[] };
  letter: { title: string; dear: string; titleAuto: boolean; dearAuto: boolean; style: "formal" | "friendly" };
  address: { street: Address; poBox: { box: string; city: string; state: string; zip: string; country: string }; future: Address & { from: string } };
  notes: string;
  bank: { routing: string; account: string; name: string; institution: string; phone: string; address: string };
  intake: {
    referredBy: string;
    reason: string;
    practiceArea: string;
    contactPreference: "" | "Home Phone" | "Cell Phone" | "E-Mail" | "Other";
    contactPreferenceOther: string;
    mailingAddress: string;
    marriageDate: string;
    children: "" | "Yes" | "No";
    childrenDetails: string;
  };
  labels: { supplier: boolean; marketingConsent: boolean };
  photo: string | null; // small data URL
};

export const TITLES = ["", "Mr.", "Mrs.", "Ms.", "Miss", "Dr.", "Prof.", "Hon.", "Rev."];
export const RELATIONSHIP = ["", "Single", "Married", "Domestic partnership", "Separated", "Divorced", "Widowed"];
export const CONTACT_KINDS: ContactKind[] = ["Email", "Phone", "Cell", "Fax", "Web", "Other"];
// The firm's practice areas (from its intake sheet).
export const PRACTICE_AREAS = [
  "", "Bankruptcy", "Business Law", "Collection", "Contract Review", "Estate Planning", "Family Law", "General Litigation",
  "Immigration", "Landlord/Tenant", "Probate", "Property Tax Appeals", "Real Estate", "Other",
];
export const CONTACT_PREFERENCES = ["", "Home Phone", "Cell Phone", "E-Mail", "Other"] as const;

export const APT_TYPES = ["Apt.", "Suite", "Unit", "Floor", "Room", "Bldg."];
export const ENTITY_TYPES = ["", "LLC", "Corporation", "S Corporation", "Partnership", "LLP", "Sole proprietorship", "Non-profit", "Trust", "Estate", "Government", "Other"];

const emptyAddress = (): Address => ({ building: "", aptType: "", aptNo: "", street: "", city: "", county: "", state: "", zip: "", zip4: "", country: "United States", instructions: "" });

export const newPerson = (): Person => ({
  id: Math.random().toString(36).slice(2, 10),
  title: "", first: "", middle: "", last: "", previousNames: "", suffix: "", gender: "", relationship: "",
  contacts: [{ kind: "Email", value: "" }, { kind: "Phone", value: "" }, { kind: "Cell", value: "" }, { kind: "Fax", value: "" }, { kind: "Web", value: "" }],
  dob: "", placeOfBirth: "", countryOfBirth: "", nationality: "", dod: "", placeOfDeath: "",
  occupation: "", employer: "", education: "", ssnLast4: "", driversLicense: "", preferredLanguage: "", extra: [],
});

export const emptyProfile = (): Profile => ({
  people: [newPerson()],
  company: { name: "", legalName: "", entityType: "", ein: "", website: "", contacts: [{ kind: "Email", value: "" }, { kind: "Phone", value: "" }, { kind: "Fax", value: "" }, { kind: "Web", value: "" }] },
  letter: { title: "", dear: "", titleAuto: true, dearAuto: true, style: "formal" },
  address: { street: emptyAddress(), poBox: { box: "", city: "", state: "", zip: "", country: "United States" }, future: { ...emptyAddress(), from: "" } },
  notes: "",
  bank: { routing: "", account: "", name: "", institution: "", phone: "", address: "" },
  intake: { referredBy: "", reason: "", practiceArea: "", contactPreference: "", contactPreferenceOther: "", mailingAddress: "", marriageDate: "", children: "", childrenDetails: "" },
  labels: { supplier: false, marketingConsent: false },
  photo: null,
});

// Fills gaps from older or partial data so the form always has every field.
export function normalizeProfile(raw: unknown): Profile {
  const base = emptyProfile();
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Profile>;
  return {
    ...base,
    ...p,
    people: Array.isArray(p.people) && p.people.length ? p.people.map((x) => ({ ...newPerson(), ...x, contacts: x.contacts?.length ? x.contacts : newPerson().contacts, extra: x.extra ?? [] })) : base.people,
    company: { ...base.company, ...(p.company ?? {}) },
    letter: { ...base.letter, ...(p.letter ?? {}) },
    address: {
      street: { ...base.address.street, ...(p.address?.street ?? {}) },
      poBox: { ...base.address.poBox, ...(p.address?.poBox ?? {}) },
      future: { ...base.address.future, ...(p.address?.future ?? {}) },
    },
    bank: { ...base.bank, ...(p.bank ?? {}) },
    intake: { ...base.intake, ...(p.intake ?? {}) },
    labels: { ...base.labels, ...(p.labels ?? {}) },
  };
}

const join = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join(" ");

export const personName = (p: Person) => join(p.first, p.middle, p.last, p.suffix);
export const personFullTitle = (p: Person) => join(p.title, p.first, p.middle, p.last, p.suffix);

export function cardName(type: CardType, pr: Profile) {
  if (type === "company") return pr.company.name.trim();
  const names = pr.people.map(personName).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  // "Mariusz Lublinski & Anna Lublinski"
  return names.join(" & ");
}

export function autoLetter(type: CardType, pr: Profile) {
  if (type === "company") return { title: pr.company.name.trim(), dear: "Sir or Madam" };
  const ps = pr.people.filter((p) => personName(p));
  const title = ps.map(personFullTitle).join(" and ");
  const dear =
    pr.letter.style === "friendly"
      ? ps.map((p) => p.first.trim()).filter(Boolean).join(" and ")
      : ps.map((p) => join(p.title, p.last) || personName(p)).join(" and ");
  return { title, dear };
}

const firstOf = (lines: ContactLine[], kinds: ContactKind[]) => lines.find((l) => kinds.includes(l.kind) && l.value.trim())?.value.trim() ?? null;

export function formatAddress(a: Address) {
  const line1 = join(a.street, a.aptNo ? `${a.aptType || "Apt."} ${a.aptNo}` : "");
  const line2 = [a.city, join(a.state, a.zip ? a.zip + (a.zip4 ? `-${a.zip4}` : "") : "")].map((x) => x.trim()).filter(Boolean).join(", ");
  return [a.building, line1, line2, a.country && a.country !== "United States" ? a.country : ""].map((x) => x.trim()).filter(Boolean).join(", ");
}

// Core client fields kept in sync with the card (used by Clients, Records…).
export function coreFields(type: CardType, pr: Profile) {
  const lines = type === "company" ? pr.company.contacts : pr.people.flatMap((p) => p.contacts);
  return {
    name: cardName(type, pr),
    type: type === "company" ? "Legal entity" : "Individual",
    email: firstOf(lines, ["Email"]),
    phone: firstOf(lines, ["Cell", "Phone"]),
    address: formatAddress(pr.address.street) || null,
  };
}

export function ageFrom(dob: string, until?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return "";
  const a = new Date(dob + "T12:00:00");
  const b = until && /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(until + "T12:00:00") : new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 0) return "";
  return `${Math.floor(months / 12)} y ${months % 12} m`;
}
