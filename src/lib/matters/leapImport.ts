// Reads matters copied out of LEAP's matter list (or a LEAP export / CSV):
//   NO. | CLIENT | MATTER TYPE | OTHER | RESP. | STATUS
//   REP-2026-3608 | Clark | Purchase - Residential - 88 Riva Blvd., Brick, NJ | Rosky | PR | FILE COMPLETE
// Works with tab-separated rows (copy from LEAP / Excel), CSV, or one cell per line.

export type LeapRow = {
  number: string; // REP-2026-3608
  code: string; // REP
  client: string; // Clark
  matterType: string; // Purchase - Residential - 88 Riva Blvd., Brick, NJ
  kind: string; // Purchase
  address: string; // 88 Riva Blvd., Brick, NJ
  other: string; // Rosky (the other side)
  resp: string; // PR
  leapStatus: string; // FILE COMPLETE
  closed: boolean; // file complete / not proceeding / closed
};

const NUMBER = /\b([A-Z]{2,6})-(\d{4})-(\d{3,6})\b/i;
const CLOSED = /file complete|not proceeding|closed|archived|cancel+ed/i;
const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

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

// "Purchase - Residential - 88 Riva Blvd., Brick, NJ" → kind "Purchase", address "88 Riva Blvd., Brick, NJ"
function splitMatterType(t: string) {
  const parts = t.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { kind: parts[0], address: parts.slice(2).join(" - ") };
  if (parts.length === 2) return { kind: parts[0], address: parts[1] };
  return { kind: "", address: t.trim() };
}

function toRow(cells: string[], cols: Partial<Record<keyof LeapRow | "type", number>> | null): LeapRow | null {
  const c = cells.map((x) => clean(x));
  const numIdx = cols?.number ?? c.findIndex((x) => NUMBER.test(x));
  if (numIdx < 0) return null;
  const m = NUMBER.exec(c[numIdx]);
  if (!m) return null;
  const at = (k: keyof LeapRow | "type", fallback: number) => c[cols?.[k] ?? numIdx + fallback] ?? "";
  const matterType = at("type", 2);
  const { kind, address } = splitMatterType(matterType);
  const leapStatus = at("leapStatus", 5);
  return {
    number: `${m[1].toUpperCase()}-${m[2]}-${m[3]}`,
    code: m[1].toUpperCase(),
    client: at("client", 1),
    matterType,
    kind,
    address,
    other: at("other", 3),
    resp: at("resp", 4).slice(0, 10),
    leapStatus,
    closed: CLOSED.test(leapStatus),
  };
}

export function parseLeapList(text: string): LeapRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const nonEmpty = lines.map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!nonEmpty.length) return [];
  const delim = nonEmpty.some((l) => l.includes("\t")) ? "\t" : nonEmpty.filter((l) => l.includes(",")).length > nonEmpty.length / 2 && nonEmpty.some((l) => NUMBER.test(l) && l.split(",").length >= 3) ? "," : null;

  const rows: LeapRow[] = [];
  if (delim) {
    // A header row (NO. / CLIENT / MATTER TYPE / OTHER / RESP. / STATUS) tells which column is which.
    let cols: Partial<Record<keyof LeapRow | "type", number>> | null = null;
    for (const line of nonEmpty) {
      const cells = delim === "\t" ? line.split("\t") : splitCsv(line);
      const lower = cells.map((x) => x.trim().toLowerCase());
      if (!NUMBER.test(line) && lower.some((x) => x === "client" || x.startsWith("matter type"))) {
        const find = (...names: string[]) => {
          const i = lower.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
          return i >= 0 ? i : undefined;
        };
        cols = {
          number: find("no.", "no", "number", "matter no", "file no", "file number", "matter number"),
          client: find("client"),
          type: find("matter type", "type", "description"),
          other: find("other", "other side", "other party"),
          resp: find("resp", "responsible"),
          leapStatus: find("status"),
        };
        continue;
      }
      const r = toRow(cells, cols);
      if (r) rows.push(r);
    }
  } else {
    // One cell per line: each matter number starts a new matter.
    let cur: string[] | null = null;
    const flush = () => {
      if (cur) {
        const r = toRow(cur, null);
        if (r) rows.push(r);
      }
    };
    for (const line of nonEmpty) {
      const t = line.trim();
      if (NUMBER.test(t) && t.replace(NUMBER, "").trim().length < 3) {
        flush();
        cur = [t];
      } else if (cur) cur.push(t);
    }
    flush();
  }
  // Same number twice: keep the first.
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.number) ? false : (seen.add(r.number), true))).slice(0, 1000);
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
