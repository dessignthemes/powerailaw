// A potential lead's answers poured into a client card (Client Intake →
// "Import from leads"). Fields already filled in on the card are kept.
import { genderForTitle, normalizeProfile, TITLES, type CardType, type ContactLine, type Profile } from "@/lib/clients/card";
import type { Lead } from "@/lib/leads";

const PRACTICE: Record<string, string> = {
  "Buying a home or property": "Real Estate",
  "Selling a home or property": "Real Estate",
  Refinance: "Real Estate",
  "Wills, trusts & estate planning": "Estate Planning",
  "Probate / estate administration": "Probate",
  Immigration: "Immigration",
  "Business law": "Business Law",
  "Landlord / tenant": "Landlord/Tenant",
  Other: "Other",
};
const PREFERENCE: Record<string, Profile["intake"]["contactPreference"]> = { "Phone call": "Cell Phone", Email: "E-Mail", "Text message": "Other" };

function setLine(lines: ContactLine[], kind: ContactLine["kind"], value: string): ContactLine[] {
  if (!value) return lines;
  const i = lines.findIndex((l) => l.kind === kind);
  if (i >= 0) {
    if (!lines[i].value.trim()) lines[i] = { kind, value };
    return lines;
  }
  return [...lines, { kind, value }];
}
const keep = (cur: string, next: string) => (cur.trim() ? cur : next);

export function profileFromLead(cardType: CardType, current: Profile, lead: Lead): { cardType: CardType; profile: Profile } {
  const p = normalizeProfile(structuredClone(current));
  const hasName = !!(lead.firstName || lead.lastName);
  const type: CardType = !hasName && lead.company ? "company" : cardType;
  if (type === "company") {
    p.company.name = keep(p.company.name, lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" "));
    p.company.contacts = setLine(setLine(p.company.contacts, "Email", lead.email), "Phone", lead.phone);
    if (hasName && !p.company.contactPeople.length) {
      p.company.contactPeople = [{ id: crypto.randomUUID(), name: [lead.firstName, lead.lastName].filter(Boolean).join(" "), role: "", email: lead.email, phone: lead.phone, cell: "", notes: "" }];
    }
  } else {
    const person = p.people[0];
    const title = TITLES.includes(lead.title) ? lead.title : "";
    person.title = keep(person.title, title);
    if (!person.gender && person.title) person.gender = genderForTitle(person.title);
    person.first = keep(person.first, lead.firstName);
    person.last = keep(person.last, lead.lastName);
    person.contacts = setLine(setLine(person.contacts, "Email", lead.email), "Cell", lead.phone);
    if (lead.company && !p.notes.includes(lead.company)) p.notes = [p.notes, `Company: ${lead.company}`].filter(Boolean).join("\n");
  }
  const a = p.address.street;
  if (!a.street && !a.city) {
    a.street = lead.street;
    a.city = lead.city;
    a.state = lead.state;
    a.zip = lead.zip;
  }
  p.intake.practiceArea = keep(p.intake.practiceArea, PRACTICE[lead.matterType] ?? "");
  p.intake.referredBy = keep(p.intake.referredBy, lead.referredBy);
  const reason = [lead.matterType && `${lead.matterType}.`, lead.description, lead.otherParties && `Others involved: ${lead.otherParties}`].filter(Boolean).join("\n");
  p.intake.reason = keep(p.intake.reason, reason.slice(0, 4000));
  if (!p.intake.contactPreference && PREFERENCE[lead.preferredContact]) {
    p.intake.contactPreference = PREFERENCE[lead.preferredContact];
    if (lead.preferredContact === "Text message") p.intake.contactPreferenceOther = "Text message";
  }
  const extra = [lead.bestTime && `Best time to reach: ${lead.bestTime}`, lead.notes && `Lead notes: ${lead.notes}`].filter(Boolean).join("\n");
  if (extra && !p.notes.includes(extra)) p.notes = [p.notes, extra].filter(Boolean).join("\n");
  return { cardType: type, profile: normalizeProfile(p) };
}
