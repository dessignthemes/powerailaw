// Reads contact files people export from their phone or other systems, into
// one simple shape. Used in the browser (preview) and on the server (checks).
//   .vcf  vCard: iPhone (share contacts), iCloud.com (Export vCard), Outlook, Android
//   .csv  RingCentral, Outlook, Google, or any spreadsheet with a header row

export type ImportedContact = {
  kind: "person" | "company";
  name: string;
  company: string;
  role: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string;
};

const clip = (v: string | null | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function finish(c: { first?: string; last?: string; full?: string; company?: string; role?: string; email?: string; phone?: string; address?: string; notes?: string }): ImportedContact | null {
  let personName = clip(c.full || [c.first, c.last].filter(Boolean).join(" "), 200);
  const company = clip(c.company, 200);
  // A company card (iPhone fills the name with the company): no first or last name.
  if (personName && company && personName.toLowerCase() === company.toLowerCase() && !clip(c.first, 200) && !clip(c.last, 200)) personName = "";
  const name = personName || company;
  if (!name) return null;
  const email = clip(c.email, 320).toLowerCase();
  return {
    kind: personName ? "person" : "company",
    name,
    company: personName ? company : "",
    role: clip(c.role, 100),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone: clip(c.phone, 60) || null,
    address: clip(c.address, 500) || null,
    notes: (c.notes ?? "").trim().slice(0, 5000),
  };
}

// ── vCard ──────────────────────────────────────────────────────────────────

function unescapeV(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

export function parseVCards(text: string): ImportedContact[] {
  // Lines that start with a space or tab continue the previous line.
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: ImportedContact[] = [];
  let cur: Record<string, string> | null = null;
  const firstOf = (key: string, val: string, prefer?: RegExp, params = "") => {
    if (!cur) return;
    if (!cur[key] || (prefer && prefer.test(params) && !cur[`${key}_pref`])) {
      cur[key] = val;
      if (prefer && prefer.test(params)) cur[`${key}_pref`] = "1";
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      cur = {};
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (cur) {
        const c = finish({
          full: cur.fn,
          first: cur.first,
          last: cur.last,
          company: cur.org,
          role: cur.title,
          email: cur.email,
          phone: cur.tel,
          address: cur.adr,
          notes: cur.note,
        });
        if (c) out.push(c);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const head = line.slice(0, i);
    const value = line.slice(i + 1);
    const [nameWithGroup, ...paramParts] = head.split(";");
    const prop = nameWithGroup.replace(/^[^.]+\./, "").toUpperCase(); // item1.EMAIL → EMAIL
    const params = paramParts.join(";").toUpperCase();
    switch (prop) {
      case "FN":
        cur.fn = unescapeV(value);
        break;
      case "N": {
        const [last, first] = value.split(";");
        cur.last = unescapeV(last ?? "");
        cur.first = unescapeV(first ?? "");
        break;
      }
      case "ORG":
        cur.org = unescapeV(value.split(";")[0] ?? "");
        break;
      case "TITLE":
        cur.title = unescapeV(value);
        break;
      case "EMAIL":
        firstOf("email", unescapeV(value).replace(/^mailto:/i, ""), /PREF/, params);
        break;
      case "TEL":
        firstOf("tel", unescapeV(value).replace(/^tel:/i, ""), /PREF|CELL/, params);
        break;
      case "ADR": {
        const p = value.split(";").map(unescapeV); // pobox;ext;street;city;region;zip;country
        const addr = [p[2], p[3], [p[4], p[5]].filter(Boolean).join(" "), p[6]].filter((x) => x && x.trim()).join(", ");
        firstOf("adr", addr, /PREF|WORK/, params);
        break;
      }
      case "NOTE":
        cur.note = unescapeV(value);
        break;
    }
  }
  return out;
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Column finders that cover RingCentral, Outlook and Google exports and plain spreadsheets.
const COLS: Record<string, RegExp[]> = {
  full: [/^(full ?name|name|display ?name|contact ?name)$/i],
  first: [/^(first ?name|given ?name)$/i],
  last: [/^(last ?name|surname|family ?name)$/i],
  company: [/^(company|company ?name|organi[sz]ation( 1)?( - name)?|business ?name|employer)$/i],
  role: [/^(job ?title|title|position|organi[sz]ation 1 - title)$/i],
  email: [/^(e-?mail( ?address)?|e-?mail 1( - value)?|primary ?e-?mail|business ?e-?mail|work ?e-?mail)$/i, /e-?mail/i],
  phone: [/^(phone|phone ?number|mobile ?phone|mobile|cell|business ?phone|work ?phone|phone 1 - value|primary ?phone)$/i, /phone|mobile|cell/i],
  street: [/^(business ?street|street|address|business ?address|address 1 - (street|formatted)|home ?street)$/i],
  city: [/^(business ?city|city|address 1 - city|home ?city)$/i],
  state: [/^(business ?state|state|province|region|address 1 - region|home ?state)$/i],
  zip: [/^(business ?postal ?code|postal ?code|zip|zip ?code|address 1 - postal code|home ?postal ?code)$/i],
  notes: [/^(notes?|comments?)$/i],
};

export function parseContactsCsv(text: string): ImportedContact[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const col: Record<string, number> = {};
  for (const [key, patterns] of Object.entries(COLS)) {
    for (const p of patterns) {
      const i = header.findIndex((h, idx) => p.test(h) && !Object.values(col).includes(idx));
      if (i >= 0) {
        col[key] = i;
        break;
      }
    }
  }
  const get = (r: string[], k: string) => (col[k] !== undefined ? r[col[k]] ?? "" : "");
  // Email and phone: the first column that has something in it (Business Phone may be
  // empty while Mobile Phone is filled in).
  const anyOf = (pattern: RegExp) => header.map((h, i) => (pattern.test(h) ? i : -1)).filter((i) => i >= 0);
  const emailCols = anyOf(/e-?mail/i).filter((i) => !/type|label/i.test(header[i]));
  const phoneCols = anyOf(/phone|mobile|cell/i).filter((i) => !/type|label/i.test(header[i]));
  const firstFilled = (r: string[], cols: number[]) => cols.map((i) => (r[i] ?? "").trim()).find(Boolean) ?? "";
  const out: ImportedContact[] = [];
  for (const r of rows.slice(1)) {
    const address = [get(r, "street"), get(r, "city"), [get(r, "state"), get(r, "zip")].filter((x) => x.trim()).join(" ")]
      .filter((x) => x.trim())
      .join(", ");
    const c = finish({
      full: get(r, "full"),
      first: get(r, "first"),
      last: get(r, "last"),
      company: get(r, "company"),
      role: get(r, "role"),
      email: get(r, "email").trim() || firstFilled(r, emailCols),
      phone: get(r, "phone").trim() || firstFilled(r, phoneCols),
      address,
      notes: get(r, "notes"),
    });
    if (c) out.push(c);
  }
  return out;
}

export function parseContactsFile(name: string, text: string): ImportedContact[] {
  if (/\.vcf$/i.test(name) || /^\s*BEGIN:VCARD/i.test(text)) return parseVCards(text);
  return parseContactsCsv(text);
}
