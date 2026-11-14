import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFileDates } from "@/lib/data/documents";

// The AI Agent's firm-wide matter list: count and list matters by practice area,
// matter number prefix (REP, RES…), status and when they were opened.
// When a matter was opened = the earliest of: the first document on it (the
// file's own "Date modified" when it was uploaded, else when it was added), the
// Open date entered on the matter, and the day the matter was created in
// LawPower (not for matters imported from LEAP, whose creation day is the import).

const db = () => createAdminClient();

type MatterRow = {
  id: string;
  title: string;
  category: string | null;
  status: string;
  created_at: string;
  matter_number?: string | null;
  matter_code?: string | null;
  client_id?: string | null;
  open_date?: string | null;
  description?: string | null;
};

async function all<T>(build: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const prefixOf = (m: MatterRow) => (m.matter_number ?? "").toUpperCase().match(/^([A-Z][A-Z0-9]{0,7})-\d{4}-\d+$/)?.[1] ?? (m.matter_code ?? "").toUpperCase();
const isImported = (m: MatterRow) => /^Imported\b/m.test(m.description ?? "");

export async function findMatters(
  orgId: string,
  input: { practiceArea?: string; prefix?: string; status?: string; openedFrom?: string; openedTo?: string; search?: string; limit?: number }
) {
  const matters = await all<MatterRow>((a, b) => db().from("matters").select("*").eq("org_id", orgId).order("id").range(a, b));

  // The first document on each matter.
  const fileDates = await hasFileDates();
  type DocRow = { matter_id: string | null; created_at: string; document_versions?: { file_modified_at?: string | null; created_at?: string }[] };
  const docs = await all<DocRow>((a, b) =>
    db()
      .from("documents")
      .select(`matter_id, created_at, document_versions(created_at${fileDates ? ", file_modified_at" : ""})`)
      .eq("org_id", orgId)
      .not("matter_id", "is", null)
      .order("id")
      .range(a, b)
  ).catch(() => [] as DocRow[]);
  const firstDoc = new Map<string, string>();
  for (const d of docs) {
    if (!d.matter_id) continue;
    const dates = [d.created_at, ...(d.document_versions ?? []).flatMap((v) => [v.file_modified_at, v.created_at])].filter((x): x is string => !!x).map((x) => x.slice(0, 10));
    const earliest = dates.sort()[0];
    if (earliest && (!firstDoc.has(d.matter_id) || earliest < firstDoc.get(d.matter_id)!)) firstDoc.set(d.matter_id, earliest);
  }
  const opened = (m: MatterRow): { date: string | null; basis: string } => {
    const options: { date: string; basis: string }[] = [];
    const fd = firstDoc.get(m.id);
    if (fd) options.push({ date: fd, basis: "first document" });
    if (m.open_date) options.push({ date: m.open_date.slice(0, 10), basis: "open date on the matter" });
    if (!isImported(m)) options.push({ date: m.created_at.slice(0, 10), basis: "created in LawPower" });
    options.sort((x, y) => x.date.localeCompare(y.date));
    return options[0] ?? { date: null, basis: "unknown (imported, no documents)" };
  };

  // Client names.
  const { data: cl } = await db().from("clients").select("id, name").eq("org_id", orgId).limit(5000);
  const clientName = new Map(((cl ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const area = (input.practiceArea ?? "").trim().toLowerCase();
  const prefix = (input.prefix ?? "").trim().toUpperCase();
  const status = (input.status ?? "").trim().toLowerCase();
  const words = (input.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const rows = matters
    .map((m) => ({ m, o: opened(m) }))
    .filter(({ m, o }) => {
      if (area && !(m.category ?? "").toLowerCase().includes(area) && prefixOf(m).toLowerCase() !== area) return false;
      if (prefix && prefixOf(m) !== prefix) return false;
      if (status === "open" && m.status === "Closed") return false;
      if (status === "closed" && m.status !== "Closed") return false;
      if (status && !["open", "closed", "any", "all"].includes(status) && m.status.toLowerCase() !== status) return false;
      if ((input.openedFrom || input.openedTo) && !o.date) return false;
      if (input.openedFrom && o.date! < input.openedFrom) return false;
      if (input.openedTo && o.date! > input.openedTo) return false;
      if (words.length) {
        const hay = `${m.title} ${m.matter_number ?? ""} ${m.client_id ? clientName.get(m.client_id) ?? "" : ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    })
    .sort((a, b) => (b.o.date ?? "").localeCompare(a.o.date ?? ""));

  const tally = (key: (r: (typeof rows)[number]) => string) => {
    const t: Record<string, number> = {};
    for (const r of rows) t[key(r) || "(none)"] = (t[key(r) || "(none)"] ?? 0) + 1;
    return t;
  };
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  return {
    total: rows.length,
    byPracticeArea: tally((r) => r.m.category ?? ""),
    byPrefix: tally((r) => prefixOf(r.m)),
    byStatus: tally((r) => r.m.status),
    matters: rows.slice(0, limit).map(({ m, o }) => ({
      number: m.matter_number ?? null,
      title: m.title,
      client: m.client_id ? clientName.get(m.client_id) ?? null : null,
      practiceArea: m.category,
      status: m.status,
      opened: o.date,
      openedBasis: o.basis,
    })),
    shown: Math.min(limit, rows.length),
    note: "Opened = the earliest of the first document on the matter, the Open date entered on it, and when it was created in LawPower (not for imported matters). Matters imported from LEAP with no documents have no opening date and are left out of date filters.",
  };
}
