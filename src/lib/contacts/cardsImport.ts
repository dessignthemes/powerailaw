// Importing a firm's card list (an Excel or CSV export, e.g. "Card Details" from a practice
// management system). Runs in the browser: reads the file, works out for every card whether it
// is a person, company, trust or estate, whether it is a client or a vendor (title company, law
// firm, lender…), and which company a person works at (same email domain). The person importing
// reviews and can change any of it before anything is saved.

import { unzipSync, strFromU8 } from "fflate";
import { governmentTypeOf, type ContactCategory, type ContactKind } from "@/lib/records/contactTypes";

export type CardRow = {
  key: string; // stable id from the file, so a second import skips cards already brought in
  kind: ContactKind;
  category: Exclude<ContactCategory, "">;
  vendorType: string;
  name: string;
  shortName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  workPhone: string | null;
  homePhone: string | null;
  fax: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  employerKey: string | null; // the company card this person works at
  employerName: string;
};

// ── Reading the file ───────────────────────────────────────────────────────

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const colIndex = (ref: string) => {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Text of all <t> pieces in a cell or shared string (tags may carry a prefix, e.g. <x:t>).
const texts = (xml: string) =>
  decode((xml.match(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g) ?? []).map((t) => t.replace(/<(?:\w+:)?t(?:\s[^>]*)?>|<\/(?:\w+:)?t>/g, "")).join(""));

// An .xlsx file is a zip of XML files; the first sheet holds the rows.
export function readXlsx(data: Uint8Array): string[][] {
  const files = unzipSync(data, { filter: (f) => f.name.startsWith("xl/") });
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    for (const si of strFromU8(ss).match(/<(?:\w+:)?si>[\s\S]*?<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g) ?? []) shared.push(texts(si));
  }
  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) throw new Error("That file doesn't look like an Excel workbook.");
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  for (const rowXml of xml.match(/<(?:\w+:)?row[\s>][\s\S]*?<\/(?:\w+:)?row>|<(?:\w+:)?row\s[^>]*\/>/g) ?? []) {
    const row: string[] = [];
    for (const c of rowXml.match(/<(?:\w+:)?c\s[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g) ?? []) {
      const ref = c.match(/ r="([A-Z]+\d+)"/)?.[1];
      const t = c.match(/ t="(\w+)"/)?.[1];
      let v = "";
      if (t === "inlineStr") v = texts(c);
      else {
        const raw = c.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "";
        v = t === "s" ? shared[Number(raw)] ?? "" : decode(raw);
      }
      const i = ref ? colIndex(ref) : row.length;
      row[i] = v;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// ── Working out what each card is ──────────────────────────────────────────

const COMPANY_SUFFIX = /\b(L\.?L\.?C|L\.?L\.?P|P\.?L\.?L\.?C|Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|P\.?C|P\.?A|N\.?A|National Association|LP|Group|Holdings|Partners|Partnership|Enterprises?)\b\.?/i;
const COMPANY_WORDS = /\b(bank|title|abstract|escrow|realty|realtors?|real estate|mortgage|lending|lenders?|credit union|financial|funding|insurance|agency|associates|services|solutions|properties|property management|management|construction|builders?|contractors?|development|equities|investments?|capital|ventures|law|legal|attorneys?|township|borough|city of|county|state of|department|court|clerk|tax collector|municipal|board of|authority|association|society|church|school|university|college|hospital|clinic|medical|dental|supermarket|restaurant|store|market|deli|salon|auto|motors|homes|buildings?|surveying|surveyors?|apprais\w*|inspections?|engineering|architects?|accounting|cpa|consulting|trust company|commercial|industries|international|global|systems|technologies|communications|transport|logistics|foundation|fund)\b/i;

const VENDOR_RULES: [RegExp, string][] = [
  [/\b(title|abstract|escrow|settlement services?)\b/i, "Title company"],
  [/\b(law|legal|attorneys?|esq\.?|counsel|lawyers?)\b|\bP\.?C\.?$|\bL\.?L\.?P\b|\bP\.?L\.?L\.?C\b|& associates/i, "Law firm"],
  [/\b(bank|bancorp|mortgage|lending|lenders?|loans?|credit union|funding|financial|savings)\b/i, "Lender / bank"],
  [/\b(realty|realtors?|real estate|re\/max|remax|keller williams|coldwell|century 21|berkshire hathaway|weichert|compass|sotheby)\b/i, "Real estate agency"],
  [/\b(insurance|insurers?|underwriters?)\b/i, "Insurance company"],
  [/\b(survey\w*)\b/i, "Surveyor"],
  [/\b(apprais\w*)\b/i, "Appraiser"],
  [/\b(inspect\w*)\b/i, "Inspector"],
  [/\b(cpa|accounting|accountants?|bookkeeping)\b/i, "Accountant"],
];

export function vendorTypeOf(name: string): string {
  for (const [re, t] of VENDOR_RULES) if (re.test(name)) return t;
  return "";
}

export function kindOf(name: string, cardType?: string): ContactKind {
  const t = (cardType ?? "").trim().toLowerCase();
  if (/^(people|person|individual)/.test(t)) return "person";
  if (/^(company|organi[sz]ation|business)/.test(t)) return "company";
  if (/^trust/.test(t)) return "trust";
  if (/^estate/.test(t)) return "estate";
  if (/\bestate of\b|\(estate of\)|^the estate\b|(?<!real )\bestate$/i.test(name)) return "estate";
  // "Mr. Mark Yaros, Esq.", "Dr. Ann Lee": a person (a lawyer is still a person), unless clearly a company.
  if (/^(mr|mrs|ms|miss|mx|dr|hon|judge)\.?\s/i.test(name) && !/\b(L\.?L\.?C|Inc|Corp|Company|Ltd)\b/i.test(name)) return "person";
  if (/,\s*esq\.?$/i.test(name) && !COMPANY_SUFFIX.test(name.replace(/,\s*esq\.?$/i, ""))) return "person";
  if (/\btrust\b/i.test(name)) return COMPANY_SUFFIX.test(name.replace(/\btrust\b/gi, "")) || /\bbank\b|national association/i.test(name) ? "company" : "trust";
  if (COMPANY_SUFFIX.test(name) || COMPANY_WORDS.test(name)) return "company";
  return "person";
}

const FREE_MAIL = new Set(
  "gmail.com googlemail.com yahoo.com ymail.com rocketmail.com hotmail.com outlook.com live.com msn.com aol.com icloud.com me.com mac.com comcast.net verizon.net optonline.net att.net sbcglobal.net bellsouth.net cox.net charter.net earthlink.net protonmail.com proton.me gmx.com mail.com yandex.com zoho.com wp.pl o2.pl onet.pl interia.pl op.pl".split(" "),
);
const domainOf = (email: string | null) => {
  const d = email?.split("@")[1]?.toLowerCase().trim();
  return d && !FREE_MAIL.has(d) ? d : null;
};

const clean = (v: string | undefined) => {
  const x = (v ?? "").replace(/\s+/g, " ").trim();
  return x && x !== "-" ? x : "";
};
const firstPhone = (v: string) => clean(v.split(/[;,/]| or /i)[0]);

// Finds a column by any of its usual header names.
function columns(header: string[]) {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = norm.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    shortName: find("shortname"),
    name: find("cardname", "name", "fullname", "displayname", "contactname"),
    first: find("firstname", "givenname"),
    last: find("lastname", "surname", "familyname"),
    type: find("cardtype", "type", "contacttype"),
    supplier: find("supplier", "vendor", "issupplier"),
    category: find("category", "group", "relationship"),
    employer: find("company", "employer", "worksat", "organization", "companyname"),
    email: find("firstemailaddress", "email", "emailaddress", "email1", "primaryemail"),
    building: find("buildingname"),
    level: find("streetlevel"),
    number: find("number", "streetnumber"),
    street: find("street", "address", "streetaddress", "address1"),
    city: find("towncity", "city", "town"),
    state: find("state", "province"),
    zip: find("zipcode", "zip", "postcode", "postalcode", "streetpostcode"),
    country: find("country"),
    phone: find("phone", "phonenumber", "mainphone"),
    home: find("home", "homephone"),
    work: find("work", "workphone", "businessphone"),
    mobile: find("mobile", "cell", "mobilephone", "cellphone"),
    fax: find("fax"),
    poType: find("poboxtype"),
    poNumber: find("poboxnumber"),
    poCity: find("poboxtowncity"),
    poState: find("poboxstate"),
    poZip: find("poboxzipcode"),
  };
}

// Turns the sheet's rows into cards, sorted and linked. Throws if there's no name column.
export function cardsFromRows(rows: string[][]): CardRow[] {
  const headerAt = rows.findIndex((r) => r.some((c) => /name/i.test(c)));
  if (headerAt < 0) throw new Error("Couldn't find a header row with a name column (for example “Card Name” or “Name”).");
  const col = columns(rows[headerAt]);
  if (col.name < 0 && col.shortName < 0 && col.first < 0) throw new Error("Couldn't find a name column (for example “Card Name” or “Name”).");
  const get = (r: string[], i: number) => (i >= 0 ? clean(r[i]) : "");

  const seen = new Map<string, number>();
  const cards: CardRow[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const name = get(r, col.name) || [get(r, col.first), get(r, col.last)].filter(Boolean).join(" ") || get(r, col.shortName);
    if (!name) continue;
    const kind = kindOf(name, get(r, col.type));
    const emailRaw = get(r, col.email).toLowerCase();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    const street = [get(r, col.building), get(r, col.level) && `Unit ${get(r, col.level)}`, [get(r, col.number), get(r, col.street)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const po = get(r, col.poNumber) ? [get(r, col.poType) || "PO Box", get(r, col.poNumber)].join(" ") : "";
    const city = get(r, col.city) || get(r, col.poCity);
    const state = get(r, col.state) || get(r, col.poState);
    const zip = get(r, col.zip) || get(r, col.poZip);
    const line = street || po;
    const address = [line, [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", "), get(r, col.country)].filter(Boolean).join(", ");
    const supplier = /^(y|yes|true|1)$/i.test(get(r, col.supplier));
    const catText = get(r, col.category).toLowerCase();
    // A company's line of work from its name; a person only when the name says so ("…, Esq.", "Attorney at Law").
    const vendorType = kind === "company" ? vendorTypeOf(name) : kind === "person" && /\besq\b|attorney|counsel(l)?or/i.test(name) ? "Law firm" : "";
    // Courts, county clerks, townships…: the Government group (a clear court name wins over a vendor word like "Law Division").
    const govType = kind === "company" ? governmentTypeOf(name) : "";
    const isGov = !!govType && (!vendorType || /surrogate|superior court|tax court|municipal court|county clerk|sheriff|judiciary/i.test(name)) && !/client/.test(catText);
    const category: CardRow["category"] = isGov
      ? "government"
      : supplier || /vendor|supplier/.test(catText) ? "vendor" : /client/.test(catText) ? "client" : /other/.test(catText) ? "other" : vendorType ? "vendor" : "client";
    // Same short name + name can repeat in a list (two different people): number them.
    const base = `${get(r, col.shortName)}|${name}`.toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    cards.push({
      key: (n > 1 ? `${base}#${n}` : base).slice(0, 400),
      kind,
      category,
      vendorType: category === "government" ? govType : category === "vendor" ? vendorType || (supplier ? "Other vendor" : "") : "",
      name: name.slice(0, 200),
      shortName: get(r, col.shortName).slice(0, 200),
      email,
      phone: firstPhone(get(r, col.phone) || get(r, col.work) || get(r, col.mobile) || get(r, col.home)).slice(0, 60) || null,
      mobile: firstPhone(get(r, col.mobile)).slice(0, 60) || null,
      workPhone: firstPhone(get(r, col.work)).slice(0, 60) || null,
      homePhone: firstPhone(get(r, col.home)).slice(0, 60) || null,
      fax: firstPhone(get(r, col.fax)).slice(0, 60) || null,
      address: address.slice(0, 500) || null,
      city: city.slice(0, 100) || null,
      state: state.slice(0, 40) || null,
      zip: zip.slice(0, 20) || null,
      employerKey: null,
      employerName: get(r, col.employer).slice(0, 200),
    });
  }
  linkPeople(cards);
  return cards;
}

// People join their company: by a "Company" column if the file has one, otherwise by a
// shared business email domain (jane@abctitle.com → ABC Title Agency, if its card uses abctitle.com).
export function linkPeople(cards: CardRow[]) {
  const byName = new Map<string, CardRow>();
  const byDomain = new Map<string, CardRow | null>();
  for (const c of cards) {
    if (c.kind !== "company") continue;
    byName.set(c.name.toLowerCase(), c);
    const d = domainOf(c.email);
    if (d) byDomain.set(d, byDomain.has(d) ? null : c); // two companies on one domain: don't guess
  }
  for (const c of cards) {
    if (c.kind !== "person") continue;
    const co = (c.employerName && byName.get(c.employerName.toLowerCase())) || (domainOf(c.email) ? byDomain.get(domainOf(c.email)!) : null);
    if (!co) continue;
    c.employerKey = co.key;
    c.employerName = co.name;
    // Someone at a vendor is part of that vendor (not a client).
    if (co.category === "vendor" || co.category === "government") {
      c.category = co.category;
      c.vendorType = co.vendorType;
    }
  }
}

// Companies (and trusts/estates) first, so a person's company exists before they're linked to it.
export const importOrder = (cards: CardRow[]) => [...cards].sort((a, b) => (a.kind === "person" ? 1 : 0) - (b.kind === "person" ? 1 : 0));
