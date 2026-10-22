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

// The people the firm deals with at a business, estate, trust or government client:
// the president, the executor, a trustee, an employee… each with their own details.
export type ContactPerson = { id: string; name: string; role: string; email: string; phone: string; cell: string; notes: string };

export type Profile = {
  people: Person[];
  company: { name: string; legalName: string; entityType: string; ein: string; website: string; contacts: ContactLine[]; contactPeople: ContactPerson[] };
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

// The gender a title tells us: Mr. → Male; Mrs. / Ms. / Miss → Female; anything
// else (Dr., Prof., no title…) tells us nothing, so it stays blank.
export function genderForTitle(title: string): "" | "Male" | "Female" {
  const t = title.trim().toLowerCase().replace(/\.$/, "");
  if (t === "mr") return "Male";
  if (t === "mrs" || t === "ms" || t === "miss") return "Female";
  return "";
}
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

export const newContactPerson = (): ContactPerson => ({ id: Math.random().toString(36).slice(2, 10), name: "", role: "", email: "", phone: "", cell: "", notes: "" });

// Roles offered for the people at each kind of client (any role can also be typed in).
export function rolesFor(entityType: string): string[] {
  if (entityType === "Estate") return ["Executor", "Co-executor", "Administrator", "Beneficiary", "Heir", "Estate attorney", "Accountant", "Other"];
  if (entityType === "Trust") return ["Trustee", "Co-trustee", "Successor trustee", "Grantor / settlor", "Beneficiary", "Trust officer", "Accountant", "Other"];
  if (entityType === "Government") return ["Official", "Department head", "Contracting officer", "Counsel", "Clerk", "Employee", "Other"];
  if (entityType === "Non-profit") return ["Executive director", "Board president", "Treasurer", "Secretary", "Employee", "Other"];
  return ["President", "CEO", "Owner", "Managing member", "Member", "Partner", "Officer", "Manager", "Employee", "Accountant", "Other"];
}

// Kept tidy: at most 20 people, each field trimmed to a sensible length.
function cleanContactPeople(raw: unknown): ContactPerson[] {
  if (!Array.isArray(raw)) return [];
  const t = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  return raw.slice(0, 20).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return { id: t(r.id, 20) || newContactPerson().id, name: t(r.name, 160), role: t(r.role, 80), email: t(r.email, 200), phone: t(r.phone, 40), cell: t(r.cell, 40), notes: t(r.notes, 1000) };
  });
}

export const emptyProfile = (): Profile => ({
  people: [newPerson()],
  company: { name: "", legalName: "", entityType: "", ein: "", website: "", contacts: [{ kind: "Email", value: "" }, { kind: "Phone", value: "" }, { kind: "Fax", value: "" }, { kind: "Web", value: "" }], contactPeople: [] },
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
    people: Array.isArray(p.people) && p.people.length ? p.people.map((x) => ({ ...newPerson(), ...x, gender: x.gender || genderForTitle(x.title ?? ""), contacts: x.contacts?.length ? x.contacts : newPerson().contacts, extra: x.extra ?? [] })) : base.people,
    company: { ...base.company, ...(p.company ?? {}), contactPeople: cleanContactPeople((p.company as { contactPeople?: unknown } | undefined)?.contactPeople) },
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

// ── What a client sees and may change in the portal ("Complete intake sheet") ─
// Their own details, contacts, address and intake answers. Firm-only parts
// (notes, bank, labels, letter settings, photo, practice area) and sensitive
// ID numbers (SSN, driver's license) are never shown to or changed by the client.

export type PortalPerson = Pick<
  Person,
  | "id" | "title" | "first" | "middle" | "last" | "suffix" | "previousNames" | "gender" | "relationship"
  | "dob" | "placeOfBirth" | "countryOfBirth" | "nationality" | "occupation" | "employer" | "preferredLanguage"
> & { email: string; phone: string; cell: string };

export type PortalIntake = {
  cardType: CardType;
  people: PortalPerson[];
  company: { name: string; legalName: string; entityType: string; website: string; email: string; phone: string };
  address: Pick<Address, "street" | "aptType" | "aptNo" | "city" | "county" | "state" | "zip" | "country">;
  poBox: { box: string; city: string; state: string; zip: string };
  intake: Pick<Profile["intake"], "referredBy" | "reason" | "contactPreference" | "contactPreferenceOther" | "mailingAddress" | "marriageDate" | "children" | "childrenDetails">;
};

const contactOf = (lines: ContactLine[], kind: ContactKind) => lines.find((c) => c.kind === kind)?.value ?? "";

export function portalIntakeOf(type: CardType, pr: Profile): PortalIntake {
  const a = pr.address.street;
  return {
    cardType: type,
    people: pr.people.map((p) => ({
      id: p.id, title: p.title, first: p.first, middle: p.middle, last: p.last, suffix: p.suffix, previousNames: p.previousNames,
      gender: p.gender, relationship: p.relationship, dob: p.dob, placeOfBirth: p.placeOfBirth, countryOfBirth: p.countryOfBirth,
      nationality: p.nationality, occupation: p.occupation, employer: p.employer, preferredLanguage: p.preferredLanguage,
      email: contactOf(p.contacts, "Email"), phone: contactOf(p.contacts, "Phone"), cell: contactOf(p.contacts, "Cell"),
    })),
    company: {
      name: pr.company.name, legalName: pr.company.legalName, entityType: pr.company.entityType, website: pr.company.website,
      email: contactOf(pr.company.contacts, "Email"), phone: contactOf(pr.company.contacts, "Phone"),
    },
    address: { street: a.street, aptType: a.aptType, aptNo: a.aptNo, city: a.city, county: a.county, state: a.state, zip: a.zip, country: a.country },
    poBox: { box: pr.address.poBox.box, city: pr.address.poBox.city, state: pr.address.poBox.state, zip: pr.address.poBox.zip },
    intake: {
      referredBy: pr.intake.referredBy, reason: pr.intake.reason, contactPreference: pr.intake.contactPreference,
      contactPreferenceOther: pr.intake.contactPreferenceOther, mailingAddress: pr.intake.mailingAddress,
      marriageDate: pr.intake.marriageDate, children: pr.intake.children, childrenDetails: pr.intake.childrenDetails,
    },
  };
}

const txt = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const ymdOrEmpty = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

// Puts one contact value in place (first line of that kind), adding the line if needed.
function setContact(lines: ContactLine[], kind: ContactKind, value: string): ContactLine[] {
  const i = lines.findIndex((c) => c.kind === kind);
  if (i >= 0) return lines.map((c, j) => (j === i ? { ...c, value } : c));
  return value ? [...lines, { kind, value }] : lines;
}

// The client's edits merged into the full card (everything else stays as the firm left it).
export function mergePortalIntake(type: CardType, pr: Profile, raw: unknown): Profile {
  const e = (raw ?? {}) as Partial<PortalIntake> & Record<string, unknown>;
  const next: Profile = JSON.parse(JSON.stringify(pr));
  const peopleIn = Array.isArray(e.people) ? (e.people as unknown[]).slice(0, 6) : [];
  for (const rp of peopleIn) {
    const p = (rp ?? {}) as Record<string, unknown>;
    let target = next.people.find((x) => x.id === p.id);
    if (!target) {
      if (next.people.length >= 6) continue;
      target = { ...newPerson() };
      next.people.push(target);
    }
    target.title = oneOf(txt(p.title, 10), TITLES, "");
    target.first = txt(p.first, 80);
    target.middle = txt(p.middle, 80);
    target.last = txt(p.last, 80);
    target.suffix = txt(p.suffix, 20);
    target.previousNames = txt(p.previousNames, 200);
    target.gender = oneOf(txt(p.gender, 10), ["", "Male", "Female", "Other"] as const, "");
    if (!target.gender) target.gender = genderForTitle(target.title); // known from the title (Mr. / Ms. …)
    target.relationship = oneOf(txt(p.relationship, 30), RELATIONSHIP, "");
    target.dob = ymdOrEmpty(p.dob);
    target.placeOfBirth = txt(p.placeOfBirth, 120);
    target.countryOfBirth = txt(p.countryOfBirth, 80);
    target.nationality = txt(p.nationality, 80);
    target.occupation = txt(p.occupation, 120);
    target.employer = txt(p.employer, 120);
    target.preferredLanguage = txt(p.preferredLanguage, 60);
    target.contacts = setContact(setContact(setContact(target.contacts, "Email", txt(p.email, 200)), "Phone", txt(p.phone, 40)), "Cell", txt(p.cell, 40));
  }
  // A person added in the portal but left without a name isn't kept.
  next.people = next.people.filter((x, i) => i === 0 || x.first || x.last || pr.people.some((o) => o.id === x.id));
  if (type === "company" && e.company && typeof e.company === "object") {
    const c = e.company as Record<string, unknown>;
    next.company.name = txt(c.name, 160);
    next.company.legalName = txt(c.legalName, 160);
    next.company.entityType = oneOf(txt(c.entityType, 40), ENTITY_TYPES, "");
    next.company.website = txt(c.website, 200);
    next.company.contacts = setContact(setContact(next.company.contacts, "Email", txt(c.email, 200)), "Phone", txt(c.phone, 40));
  }
  if (e.address && typeof e.address === "object") {
    const a = e.address as Record<string, unknown>;
    Object.assign(next.address.street, {
      street: txt(a.street, 160), aptType: oneOf(txt(a.aptType, 10), ["", ...APT_TYPES], ""), aptNo: txt(a.aptNo, 20),
      city: txt(a.city, 80), county: txt(a.county, 80), state: txt(a.state, 40), zip: txt(a.zip, 12), country: txt(a.country, 80) || "United States",
    });
  }
  if (e.poBox && typeof e.poBox === "object") {
    const b = e.poBox as Record<string, unknown>;
    Object.assign(next.address.poBox, { box: txt(b.box, 30), city: txt(b.city, 80), state: txt(b.state, 40), zip: txt(b.zip, 12) });
  }
  if (e.intake && typeof e.intake === "object") {
    const i = e.intake as Record<string, unknown>;
    next.intake.referredBy = txt(i.referredBy, 200);
    next.intake.reason = txt(i.reason, 3000);
    next.intake.contactPreference = oneOf(txt(i.contactPreference, 20), CONTACT_PREFERENCES, "");
    next.intake.contactPreferenceOther = txt(i.contactPreferenceOther, 120);
    next.intake.mailingAddress = txt(i.mailingAddress, 300);
    next.intake.marriageDate = ymdOrEmpty(i.marriageDate);
    next.intake.children = oneOf(txt(i.children, 5), ["", "Yes", "No"] as const, "");
    next.intake.childrenDetails = txt(i.childrenDetails, 2000);
  }
  return next;
}

// ── Names typed as one line ("Mr. William S. Mahalik", "Ms. A Zakrzewski & Mr. B Zakrzewski") ──
const COMPANY_NAME = /\b(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Company|Co\.|Trust|Estate of|LP|LLP|Group|Holdings|Partners|Properties|Realty|Bank)\b/i;
const NAME_SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|esq\.?)$/i;

export const isCompanyName = (name: string) => COMPANY_NAME.test(name);

// One person: title / first / middle / last / suffix.
export function parsePersonName(raw: string): Pick<Person, "title" | "first" | "middle" | "last" | "suffix"> {
  let words = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let title = "";
  const t = TITLES.find((x) => x && words[0] && words[0].replace(/\.$/, "").toLowerCase() === x.replace(/\.$/, "").toLowerCase());
  if (t) {
    title = t;
    words = words.slice(1);
  }
  let suffix = "";
  while (words.length > 1 && NAME_SUFFIX.test(words[words.length - 1])) suffix = [words.pop(), suffix].filter(Boolean).join(" ");
  if (words.length <= 1) return { title, first: "", middle: "", last: words[0] ?? "", suffix };
  return { title, first: words[0], middle: words.slice(1, -1).join(" "), last: words[words.length - 1], suffix };
}

// Everyone in a one-line name ("A & B", "A and B").
export function peopleFromName(name: string): Person[] {
  return name
    .split(/\s+(?:&|and)\s+/i)
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((n) => ({ ...newPerson(), ...parsePersonName(n) }));
}
