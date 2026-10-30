import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";

// Extra matter details (migration 0063): who's responsible, reference numbers,
// dates and the trust minimum. Kept apart from the main matter save so the rest
// works before the migration is run.
export type MatterInfo = {
  originatingAttorney: string | null; // profile id
  responsibleStaff: string | null; // profile id
  clientReference: string;
  location: string;
  openDate: string | null;
  pendingDate: string | null;
  closedDate: string | null;
  solDate: string | null;
  solSatisfied: boolean;
  trustMinimum: number | null;
};

export class MatterInfoError extends Error {
  constructor(public status: 400 | 404 | 503, message: string) {
    super(message);
  }
}

const COLS = "originating_attorney, responsible_staff, client_reference, location, open_date, pending_date, closed_date, sol_date, sol_satisfied, trust_minimum";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /originating_attorney|responsible_staff|client_reference|sol_date|trust_minimum|open_date/.test(e.message ?? ""));

type Row = { originating_attorney: string | null; responsible_staff: string | null; client_reference: string | null; location: string | null; open_date: string | null; pending_date: string | null; closed_date: string | null; sol_date: string | null; sol_satisfied: boolean | null; trust_minimum: number | null };
const toInfo = (r: Row): MatterInfo => ({
  originatingAttorney: r.originating_attorney,
  responsibleStaff: r.responsible_staff,
  clientReference: r.client_reference ?? "",
  location: r.location ?? "",
  openDate: r.open_date,
  pendingDate: r.pending_date,
  closedDate: r.closed_date,
  solDate: r.sol_date,
  solSatisfied: !!r.sol_satisfied,
  trustMinimum: r.trust_minimum === null ? null : Number(r.trust_minimum),
});

export async function getMatterInfo(id: string): Promise<{ info: MatterInfo | null; ready: boolean }> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient().from("matters").select(COLS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) {
    if (missing(error)) return { info: null, ready: false };
    throw error;
  }
  if (!data) throw new MatterInfoError(404, "That matter wasn't found.");
  return { info: toInfo(data as unknown as Row), ready: true };
}

export async function saveMatterInfo(id: string, b: Record<string, unknown>): Promise<MatterInfo> {
  const orgId = await getCurrentOrgId();
  const s = createAdminClient();
  const patch: Record<string, unknown> = {};
  const person = async (v: unknown) => {
    if (v === null || v === "") return null;
    if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new MatterInfoError(400, "Pick someone from the firm.");
    const { data } = await s.from("profiles").select("id").eq("org_id", orgId).eq("id", v).maybeSingle();
    if (!data) throw new MatterInfoError(400, "That person isn't in the firm.");
    return v;
  };
  const date = (v: unknown) => (v === null || v === "" ? null : typeof v === "string" && DATE.test(v) ? v : (() => { throw new MatterInfoError(400, "Check the dates."); })());
  if ("originatingAttorney" in b) patch.originating_attorney = await person(b.originatingAttorney);
  if ("responsibleStaff" in b) patch.responsible_staff = await person(b.responsibleStaff);
  if ("clientReference" in b) patch.client_reference = String(b.clientReference ?? "").trim().slice(0, 100);
  if ("location" in b) patch.location = String(b.location ?? "").trim().slice(0, 200);
  for (const [k, col] of [["openDate", "open_date"], ["pendingDate", "pending_date"], ["closedDate", "closed_date"], ["solDate", "sol_date"]] as const) if (k in b) patch[col] = date(b[k]);
  if ("solSatisfied" in b) patch.sol_satisfied = b.solSatisfied === true;
  if ("trustMinimum" in b) {
    const n = b.trustMinimum === null || b.trustMinimum === "" ? null : Math.round(Number(b.trustMinimum) * 100) / 100;
    if (n !== null && (!Number.isFinite(n) || n < 0)) throw new MatterInfoError(400, "Check the trust minimum.");
    patch.trust_minimum = n;
  }
  const { data, error } = await s.from("matters").update(patch).eq("org_id", orgId).eq("id", id).select(COLS).maybeSingle();
  if (error) {
    if (missing(error)) throw new MatterInfoError(503, "These matter details need a database update first (migration 0063).");
    throw error;
  }
  if (!data) throw new MatterInfoError(404, "That matter wasn't found.");
  return toInfo(data as unknown as Row);
}
