// Reads matters copied out of LEAP's matter list (or a LEAP export / CSV):
//   NO. | CLIENT | MATTER TYPE | OTHER | RESP. | STATUS
//   REP-2026-3608 | Clark | Purchase - Residential - 88 Riva Blvd., Brick, NJ | Rosky | PR | FILE COMPLETE
// Works with tab-separated rows (copy from LEAP / Excel), CSV, or one cell per line.

export type LeapRow = {
  number: string; // REP-2026-3608
  code: string; // REP
  client: string; // Clark (or "Mr. Jason Szczypinski")
  matterType: string; // Purchase - Residential - 88 Riva Blvd., Brick, NJ
  kind: string; // Purchase
  address: string; // the property (from the matter type, or a Property column)
  other: string; // the other side
  resp: string; // PR
  leapStatus: string; // FILE COMPLETE
  closed: boolean; // file complete / not proceeding / closed
  // From extra LEAP columns, when the file has them:
  fields: Partial<Record<FieldTarget, string>>;
  extras: Record<string, string>; // columns that fit no field, kept as "Other LEAP information"
};

// What a column of the LEAP file can mean.
export const FIELD_TARGETS = [
  ["number", "Matter number"],
  ["client", "Client name"],
  ["clientTitle", "Client title (Mr./Mrs.)"],
  ["clientFirst", "Client first name"],
  ["clientLast", "Client last name"],
  ["clientEmail", "Client email"],
  ["clientPhone", "Client phone"],
  ["clientCell", "Client cell / mobile"],
  ["clientStreet", "Client street address"],
  ["clientStreet2", "Client address line 2"],
  ["clientCity", "Client city"],
  ["clientState", "Client state"],
  ["clientZip", "Client ZIP"],
  ["clientCountry", "Client country"],
  ["mailingAddress", "Mailing address"],
  ["matterType", "Matter type / description"],
  ["property", "Property address"],
  ["other", "Other side (name)"],
  ["otherEmail", "Other side email"],
  ["otherPhone", "Other side phone"],
  ["otherAttorneyName", "Other side's attorney"],
  ["otherAttorneyFirm", "Other side's law firm"],
  ["otherAttorneyEmail", "Other side's attorney email"],
  ["otherAttorneyPhone", "Other side's attorney phone"],
  ["resp", "Responsible (initials)"],
  ["leapStatus", "LEAP status"],
  ["notes", "Notes"],
  ["keep", "Keep as other information"],
  ["ignore", "Don't import"],
] as const;
export type FieldTarget = (typeof FIELD_TARGETS)[number][0];

const NUMBER = /\b([A-Z]{2,6})-(\d{4})-(\d{3,6})\b/i;
const CLOSED = /file complete|not proceeding|closed|archived|cancel+ed/i;
const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, 500);

// Header text → meaning (the more specific names first).
const SYNONYMS: [FieldTarget, RegExp][] = [
  ["otherAttorneyEmail", /^(other ?side|opposing|other party)?.*(attorney|counsel|solicitor|lawyer).*e-?mail/],
  ["otherAttorneyPhone", /^(other ?side|opposing|other party)?.*(attorney|counsel|solicitor|lawyer).*(phone|tel|mobile|cell)/],
  ["otherAttorneyFirm", /(attorney|counsel|solicitor|lawyer).*firm|^(other ?side|opposing).*firm|^law firm$/],
  ["otherAttorneyName", /^(other ?side|opposing|other party).*(attorney|counsel|solicitor|lawyer)|^(opposing|other) counsel$|^(attorney|counsel|solicitor)( name)?$/],
  ["otherEmail", /^(other ?side|other party|opposing( party)?|other)[ -]?e-?mail/],
  ["otherPhone", /^(other ?side|other party|opposing( party)?|other)[ -]?(phone|tel|mobile|cell)/],
  ["other", /^(other|other ?side|other party|opposing( party)?|opponent|counterparty|other side name)$/],
  ["mailingAddress", /mailing|postal address|correspondence|mail(ing)? to/],
  ["property", /^(property|premises|subject property|property address|real estate)/],
  ["clientTitle", /^(client )?(title|salutation|prefix)$/],
  ["clientFirst", /^(client )?(first|given)( ?name)?$/],
  ["clientLast", /^(client )?(last|family|sur)( ?name)?$|^surname$/],
  ["clientCell", /(mobile|cell)/],
  ["clientEmail", /e-?mail/],
  ["clientPhone", /(phone|tel|telephone)/],
  ["clientStreet2", /(address|street|addr)[ .]*(line )?2|address 2|unit|apt|suite/],
  ["clientStreet", /(^|client |home |street )(address|street|addr)( ?(line )?1)?$|^address$|^street address$/],
  ["clientCity", /^(client )?(city|town|suburb|municipality)/],
  ["clientState", /^(client )?(state|province)$/],
  ["clientZip", /^(client )?(zip|zip ?code|post ?code|postal ?code)$/],
  ["clientCountry", /^(client )?country$/],
  ["matterType", /^(matter )?(type|description|desc)$|^matter type|^matter description|^matter$/],
  ["resp", /^(resp|responsible|person responsible|attorney responsible|staff|assigned( to)?)\.?$/],
  ["leapStatus", /^(matter )?(status|stage)$/],
  ["notes", /^(notes?|comments?|memo|remarks)$/],
  ["client", /^(client|clients|client names?|client name\(s\)|name|full name|card)$/],
];

export function guessTarget(header: string): FieldTarget {
  const h = header.toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return "keep";
  if (/^(no|number|matter no|matter number|file no|file number|matter id|ref|reference|matter ref)$/.test(h)) return "number";
  for (const [t, re] of SYNONYMS) if (re.test(h)) return t;
  return "keep";
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// CSV with line breaks inside quoted cells (LEAP addresses often have them).
function csvRecords(text: string): string[][] {
  const lines: string[] = [];
  let buf = "";
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    buf = buf ? `${buf} ${raw}` : raw;
    if ((buf.match(/"/g)?.length ?? 0) % 2 === 0) {
      lines.push(buf);
      buf = "";
    }
  }
  if (buf) lines.push(buf);
  return lines.filter((l) => l.trim()).map(splitCsv);
}

// "Purchase - Residential - 88 Riva Blvd., Brick, NJ" → kind "Purchase", address "88 Riva Blvd., Brick, NJ"
function splitMatterType(t: string) {
  const parts = t.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { kind: parts[0], address: parts.slice(2).join(" - ") };
  if (parts.length === 2) return { kind: parts[0], address: /\d/.test(parts[1]) ? parts[1] : "" };
  return { kind: "", address: "" };
}

export type LeapTable = { headers: string[] | null; records: string[][] };

// The pasted / uploaded text as columns (header row if there is one).
export function readLeapTable(text: string): LeapTable {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return { headers: null, records: [] };
  const tabs = lines.some((l) => l.includes("\t"));
  const csv = !tabs && lines.filter((l) => l.includes(",")).length > lines.length / 2;
  if (tabs || csv) {
    const recs = tabs ? lines.map((l) => l.split("\t")) : csvRecords(text);
    const first = recs[0] ?? [];
    const looksHeader = !first.some((c) => NUMBER.test(c)) && first.filter((c) => clean(c)).length >= 2;
    return looksHeader ? { headers: first.map((c) => clean(c)), records: recs.slice(1) } : { headers: null, records: recs };
  }
  // One cell per line: each matter number starts a new matter (No., Client, Type, Other, Resp, Status).
  const records: string[][] = [];
  let cur: string[] | null = null;
  for (const l of lines) {
    const t = l.trim();
    if (NUMBER.test(t) && t.replace(NUMBER, "").trim().length < 3) {
      if (cur) records.push(cur);
      cur = [t];
    } else if (cur) cur.push(t);
  }
  if (cur) records.push(cur);
  return { headers: null, records };
}

// Column meanings for a table: from its headers, or LEAP's list order when there are none.
export function defaultMapping(table: LeapTable): FieldTarget[] {
  const width = Math.max(table.headers?.length ?? 0, ...table.records.slice(0, 50).map((r) => r.length));
  if (!table.headers) {
    const numIdx = Math.max(0, table.records[0]?.findIndex((c) => NUMBER.test(c)) ?? 0);
    const order: FieldTarget[] = ["number", "client", "matterType", "other", "resp", "leapStatus"];
    return Array.from({ length: width }, (_, i) => order[i - numIdx] ?? "keep");
  }
  const map = Array.from({ length: width }, (_, i) => guessTarget(table.headers![i] ?? ""));
  // The matter number column is the one whose values look like REP-2026-3608.
  if (!map.includes("number")) {
    let best = -1;
    let bestHits = 0;
    for (let i = 0; i < width; i++) {
      const hits = table.records.slice(0, 50).filter((r) => NUMBER.test(r[i] ?? "")).length;
      if (hits > bestHits) [best, bestHits] = [i, hits];
    }
    if (best >= 0) map[best] = "number";
  }
  // One column per field (the first wins; later duplicates are kept as other information).
  const seen = new Set<FieldTarget>();
  return map.map((t) => (t === "keep" || t === "ignore" ? t : seen.has(t) ? "keep" : (seen.add(t), t)));
}

export function rowsFromTable(table: LeapTable, mapping: FieldTarget[]): LeapRow[] {
  const rows: LeapRow[] = [];
  const seen = new Set<string>();
  for (const rec of table.records) {
    const fields: Partial<Record<FieldTarget, string>> = {};
    const extras: Record<string, string> = {};
    rec.forEach((cell, i) => {
      const v = clean(cell);
      if (!v) return;
      const t = mapping[i] ?? "keep";
      if (t === "ignore") return;
      if (t === "keep") {
        if (table.headers?.[i]) extras[table.headers[i]] = v;
        return;
      }
      fields[t] = fields[t] ? `${fields[t]}, ${v}` : v;
    });
    const m = NUMBER.exec(fields.number ?? "") ?? NUMBER.exec(rec.join(" "));
    if (!m) continue;
    const number = `${m[1].toUpperCase()}-${m[2]}-${m[3]}`;
    if (seen.has(number)) continue;
    seen.add(number);
    const matterType = fields.matterType ?? "";
    const split = splitMatterType(matterType);
    const client =
      fields.client ?? [fields.clientTitle, fields.clientFirst, fields.clientLast].filter(Boolean).join(" ").trim();
    const leapStatus = fields.leapStatus ?? "";
    rows.push({
      number,
      code: m[1].toUpperCase(),
      client,
      matterType,
      kind: split.kind,
      address: fields.property ?? split.address,
      other: fields.other ?? "",
      resp: (fields.resp ?? "").slice(0, 10),
      leapStatus,
      closed: CLOSED.test(leapStatus),
      fields,
      extras,
    });
  }
  return rows.slice(0, 2000);
}

export function parseLeapList(text: string): LeapRow[] {
  const table = readLeapTable(text);
  return rowsFromTable(table, defaultMapping(table));
}

// Matter type in LawPower for a LEAP code.
export function categoryForCode(code: string): string {
  if (["REP", "RES", "REF", "RE", "COM"].includes(code)) return "Real Estate";
  if (["EST", "PRO", "ADM", "EP"].includes(code)) return code === "EP" ? "Estate Planning" : "Probate";
  if (["LIT", "CIV"].includes(code)) return "Litigation";
  if (["FAM", "DIV"].includes(code)) return "Family Law";
  if (["IMM"].includes(code)) return "Immigration";
  if (["PI"].includes(code)) return "Personal Injury";
  if (["CRIM", "CR"].includes(code)) return "Criminal Defense";
  if (["BUS", "CORP"].includes(code)) return "Business / Corporate";
  return "None";
}
