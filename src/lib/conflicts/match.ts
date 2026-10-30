// Conflict checks: finding people and companies that may be the one being
// checked. Pure functions (no database), so they can be tested on their own.
// Matching is deliberately generous; the AI then decides which candidates are
// really the same person and whether they're on the other side.

export type Side = "client" | "adverse" | "third_party" | "unknown";

// One person or company somewhere in the firm's records.
export type Party = {
  matterId: string | null;
  name: string;
  role: string; // "Seller", "Buyer (our client)", "Seller's attorney — Attorney", "Client", …
  side: Side; // what the record suggests; the AI has the final say
  emails: string[];
  phones: string[];
  source: "client" | "matter_details" | "counterparty" | "matter_contact" | "title" | "client_record";
};

export type Searched = { names: string[]; companies: string[]; emails: string[]; phones: string[] };

export type Candidate = Party & { score: number; why: string };

const STOP = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "esq", "esquire", "jr", "sr", "ii", "iii", "iv", "phd", "md", "cpa",
  "llc", "l", "c", "inc", "corp", "corporation", "co", "company", "ltd", "lp", "llp", "pc", "pa", "pllc", "the", "of", "and", "et", "al", "ux",
  "estate", "trust", "revocable", "living", "family", "group", "holdings", "properties", "property", "realty", "associates", "partners", "partnership",
  "a", "an", "aka", "fka", "nka", "dba", "deceased", "dec", "his", "her", "wife", "husband", "h", "w",
]);

export function normTokens(s: string): string[] {
  return (s ?? "")
    .replace(/[łŁ]/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

// Polish surnames change with gender (Kowalski / Kowalska, Nowicki / Nowicka,
// Zawadzki / Zawadzka) and a wife's form may end in -owa: compare their stems.
export function stem(t: string): string {
  return t
    .replace(/(sk|ck|dzk)(a|i|ie)$/, "$1i")
    .replace(/(.{3,})(owa|owna|ówna|ewa)$/, "$1")
    .replace(/(.{4,})s$/, "$1"); // "Smiths", "Jones"/"Jone" both reduce
}

export function lev(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Same word, allowing gender endings and one typo in longer words.
function sameWord(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return true;
  return Math.min(a.length, b.length) >= 6 && lev(sa, sb, 1) <= 1;
}

export const digits = (p: string) => (p ?? "").replace(/\D/g, "").slice(-10);
export const cleanEmail = (e: string) => (e ?? "").trim().toLowerCase();

// Splits "John & Mary Smith, Peter Nowak" into names.
export function splitNames(s: string): string[] {
  const parts = (s ?? "")
    .split(/\s*(?:[,;\n]|\band\b|&|\/)\s*/i)
    .map((x) => x.trim())
    .filter((x) => normTokens(x).length > 0);
  // "John & Mary Smith": give "John" the last name of the next full name.
  return parts.map((p, i) => {
    if (normTokens(p).length !== 1) return p;
    const next = parts.slice(i + 1).map(normTokens).find((t) => t.length >= 2);
    return next ? `${p} ${next[next.length - 1]}` : p;
  });
}

type Want = { tokens: string[]; first: string | null; last: string; company: boolean; raw: string };

function wants(s: Searched): Want[] {
  const out: Want[] = [];
  for (const raw of s.names) {
    const t = normTokens(raw);
    if (!t.length) continue;
    out.push({ tokens: t, first: t.length > 1 ? t[0] : null, last: t[t.length - 1], company: false, raw });
  }
  for (const raw of s.companies) {
    const t = normTokens(raw);
    if (t.length) out.push({ tokens: t, first: null, last: t[t.length - 1], company: true, raw });
  }
  return out;
}

function scoreName(w: Want, partyName: string): { score: number; why: string } {
  const pt = normTokens(partyName);
  if (!pt.length) return { score: 0, why: "" };
  if (w.company) {
    // Companies: most of the meaningful words in common.
    const common = w.tokens.filter((x) => pt.some((y) => sameWord(x, y))).length;
    const ratio = common / Math.max(1, Math.min(w.tokens.length, pt.length));
    if (common >= 1 && ratio >= 0.99) return { score: 3, why: `company name matches "${w.raw}"` };
    if (common >= 1 && ratio >= 0.6) return { score: 2, why: `company name is similar to "${w.raw}"` };
    return { score: 0, why: "" };
  }
  const lastHit = pt.some((y) => sameWord(w.last, y));
  if (!lastHit) {
    // Maybe the last name went first ("Kowalski Jan") or the name is reversed.
    if (w.first && pt.some((y) => sameWord(w.first!, y)) && pt.length === 1) return { score: 0, why: "" };
    return { score: 0, why: "" };
  }
  if (!w.first) return { score: 2, why: `last name matches "${w.raw}"` };
  const others = pt.filter((y) => !sameWord(w.last, y));
  if (others.some((y) => sameWord(w.first!, y))) return { score: 3, why: `full name matches "${w.raw}"` };
  if (others.some((y) => y.length === 1 && y === w.first![0])) return { score: 2, why: `last name and first initial match "${w.raw}"` };
  if (!others.length) return { score: 2, why: `last name matches "${w.raw}" (no first name on file)` };
  return { score: 1, why: `same last name as "${w.raw}" (different first name)` };
}

export function findCandidates(s: Searched, parties: Party[], limit = 60): Candidate[] {
  const ws = wants(s);
  const emails = new Set(s.emails.map(cleanEmail).filter((e) => e.includes("@")));
  const phones = new Set(s.phones.map(digits).filter((p) => p.length >= 7));
  const out: Candidate[] = [];
  for (const p of parties) {
    let best = { score: 0, why: "" };
    for (const w of ws) {
      const r = p.source === "title" ? titleScore(w, p.name) : scoreName(w, p.name);
      if (r.score > best.score) best = r;
    }
    if (p.emails.some((e) => emails.has(cleanEmail(e)))) best = { score: 4, why: "same email address" };
    else if (p.phones.some((x) => phones.has(digits(x)))) best = { score: 4, why: "same phone number" };
    if (best.score > 0) out.push({ ...p, ...best });
  }
  // Strongest first; per matter, keep the best few.
  out.sort((a, b) => b.score - a.score);
  const perMatter = new Map<string, number>();
  const kept: Candidate[] = [];
  for (const c of out) {
    const k = `${c.matterId ?? "none"}:${normTokens(c.name).join(" ")}:${c.role}`;
    if (perMatter.has(k)) continue;
    perMatter.set(k, 1);
    kept.push(c);
    if (kept.length >= limit) break;
  }
  return kept;
}

// A matter's title or description mentions the last name / company.
function titleScore(w: Want, text: string): { score: number; why: string } {
  const t = normTokens(text);
  if (w.company) {
    const common = w.tokens.filter((x) => t.some((y) => sameWord(x, y))).length;
    return common >= Math.max(1, Math.ceil(w.tokens.length * 0.8)) ? { score: 1, why: `"${w.raw}" appears in the matter's title or description` } : { score: 0, why: "" };
  }
  if (w.last.length < 3 || !t.some((y) => sameWord(w.last, y))) return { score: 0, why: "" };
  const full = w.first && t.some((y) => sameWord(w.first!, y));
  return { score: full ? 2 : 1, why: full ? `"${w.raw}" appears in the matter's title or description` : `the last name of "${w.raw}" appears in the matter's title or description` };
}
