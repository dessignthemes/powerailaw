import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { ageFrom, personFullTitle, personName, formatAddress, type CardType, type Person, type Profile } from "@/lib/clients/card";

// The firm's own Word documents, with {{PLACEHOLDERS}} where the client's
// details go. Filling them keeps every bit of the firm's formatting.

export type TemplateKind = "intake" | "engagement";
const FILES: Record<TemplateKind, string> = {
  intake: "client-intake-sheet.docx",
  engagement: "engagement-real-estate-purchase.docx",
};

// These templates carry one firm's letterhead and terms, so they're only
// offered to that firm's workspace (by email domain).
export const TEMPLATE_DOMAINS = ["rapciewiczlaw.com"];
export const templatesAllowed = (email: string | null | undefined) =>
  !!email && TEMPLATE_DOMAINS.includes(email.split("@").pop()?.toLowerCase() ?? "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function fillTemplate(kind: TemplateKind, values: Record<string, string>): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(path.join(process.cwd(), "src", "templates", FILES[kind])));
  const files = unzipSync(bytes);
  for (const name of Object.keys(files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    let xml = strFromU8(files[name]);
    xml = xml.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, key: string) => {
      const v = values[key] ?? "";
      // Line breaks become Word line breaks inside the same run.
      return esc(v).split(/\r?\n/).join('</w:t><w:br/><w:t xml:space="preserve">');
    });
    // Keep spaces at the edges of filled text.
    xml = xml.replace(/<w:t>/g, '<w:t xml:space="preserve">');
    files[name] = strToU8(xml);
  }
  return zipSync(files, { level: 6 });
}

const usDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "");
const line = (p: Person | undefined, ...kinds: string[]) => p?.contacts.find((c) => kinds.includes(c.kind) && c.value.trim())?.value.trim() ?? "";
const employment = (p?: Person) => [p?.occupation, p?.employer].map((x) => x?.trim()).filter(Boolean).join(", ");

export function intakeValues(cardType: CardType, pr: Profile): Record<string, string> {
  const [p1, p2] = cardType === "company" ? [undefined, undefined] : pr.people;
  const a = pr.address.street;
  const box = pr.address.poBox;
  const poBox = box.box ? `P.O. Box ${box.box}, ${[box.city, [box.state, box.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}` : "";
  const pref = pr.intake.contactPreference === "Other" ? `Other: ${pr.intake.contactPreferenceOther}` : pr.intake.contactPreference;
  return {
    LAST: cardType === "company" ? pr.company.name : p1?.last ?? "",
    FIRST: cardType === "company" ? "" : p1?.first ?? "",
    MI: p1?.middle?.trim().charAt(0) ?? "",
    STREET: a.street,
    APT: a.aptNo ? `${a.aptType || "Apt."} ${a.aptNo}` : "",
    CITY: a.city,
    STATE: a.state,
    ZIP: a.zip + (a.zip4 ? `-${a.zip4}` : ""),
    MAILING: pr.intake.mailingAddress || poBox,
    HOME_PHONE: cardType === "company" ? line({ contacts: pr.company.contacts } as Person, "Phone") : line(p1, "Phone"),
    CELL_PHONE: line(p1, "Cell"),
    EMAIL: cardType === "company" ? line({ contacts: pr.company.contacts } as Person, "Email") : line(p1, "Email"),
    SPOUSE_PHONE: line(p2, "Cell", "Phone"),
    PREFERENCE: pref,
    DOB: usDate(p1?.dob ?? ""),
    AGE: p1?.dob ? ageFrom(p1.dob, p1.dod).split(" y")[0] : "",
    SSN: p1?.ssnLast4 ? `XXX-XX-${p1.ssnLast4}` : "",
    MARITAL: p1?.relationship ?? "",
    MARRIAGE_DATE: usDate(pr.intake.marriageDate),
    SPOUSE_NAME: p2 ? personName(p2) : "",
    SPOUSE_MAIDEN: p2?.previousNames ?? "",
    SPOUSE_DOB: usDate(p2?.dob ?? ""),
    SPOUSE_SSN: p2?.ssnLast4 ? `XXX-XX-${p2.ssnLast4}` : "",
    CHILDREN: pr.intake.children === "Yes" ? "Y" : pr.intake.children === "No" ? "N" : "Y  /  N",
    CHILDREN_DETAILS: pr.intake.childrenDetails,
    EMPLOYMENT: employment(p1),
    SPOUSE_EMPLOYMENT: employment(p2),
    EDUCATION: p1?.education ?? "",
    SPOUSE_EDUCATION: p2?.education ?? "",
    BANK_NAME: pr.bank.institution,
    BANK_PHONE: pr.bank.phone,
    BANK_ADDRESS: pr.bank.address,
    REFERRED_BY: pr.intake.referredBy,
    REASON: [pr.intake.practiceArea ? `Practice area: ${pr.intake.practiceArea}` : "", pr.intake.reason].filter(Boolean).join("\n"),
  };
}

export function engagementValues(
  cardType: CardType,
  pr: Profile,
  opts: { ourRef: string; yourRef: string; date: string; dear: string; description: string }
): Record<string, string> {
  const people = cardType === "company" ? [] : pr.people.filter((p) => personName(p));
  const names = cardType === "company" ? pr.company.name : people.map(personName).join(" and ");
  const signers = cardType === "company" ? [pr.company.name] : people.map(personName);
  return {
    YOUR_REF: opts.yourRef || names,
    OUR_REF: opts.ourRef,
    DATE: opts.date,
    DEAR: opts.dear || (cardType === "company" ? "Sir or Madam" : people.map(personFullTitle).join(" and ")),
    CLIENT_NAMES: names,
    MATTER_DESCRIPTION: opts.description,
    SIGNER_1: (signers[0] ?? "").toUpperCase(),
    SIGNER_2: signers.slice(1).join(" / ").toUpperCase(),
    SIGNER_2_LINE: signers.length > 1 ? "______________________________" : "",
  };
}

export const propertyLine = (a: Profile["address"]["street"]) => formatAddress(a);
