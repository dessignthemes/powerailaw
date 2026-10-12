import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import type { Matter } from "@/components/NewMatterModal";
import { cleanCode, isValidCode } from "@/lib/matters/numbering";

export class MatterInputError extends Error {
  status = 400 as const;
}

type MatterRow = {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: Matter["status"];
  category: Matter["category"];
  due_date: string | null;
  counterparty: string | null;
  blocker: string | null;
  value: number | null;
  billing_type: Matter["billingType"];
  hourly_rate: number | null;
  private_notes: string | null;
  matter_code?: string | null;
  matter_number?: string | null;
  matter_seq?: number | null;
  created_at: string;
  updated_at: string;
};

function toMatter(row: MatterRow): Matter {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    clientId: row.client_id,
    dueDate: row.due_date,
    category: row.category,
    counterparty: row.counterparty,
    blocker: row.blocker,
    value: row.value,
    billingType: row.billing_type,
    hourlyRate: row.hourly_rate,
    // Not persisted yet — there's no logged-in user/profile to reference
    // until real auth exists. Always comes back unassigned for now.
    assignedTo: null,
    privateNotes: row.private_notes ?? "",
    matterCode: row.matter_code ?? null,
    matterNumber: row.matter_number ?? null,
    matterSeq: row.matter_seq ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMatters(): Promise<Matter[]> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { data, error } = await supabase
    .from("matters")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as MatterRow[]).map(toMatter);
}

// The abbreviation sent from the browser (null = none). The number itself is
// always given by the database (migration 0025), never taken from the browser.
function codeOf(matter: Matter): string | null {
  if (!matter.matterCode) return null;
  if (!isValidCode(matter.matterCode)) throw new MatterInputError("Use 2–6 letters or numbers for the abbreviation, starting with a letter.");
  return cleanCode(matter.matterCode);
}

// Before 0025 is run there are no number columns: save without them.
const missingNumberCols = (e: { message?: string } | null) => !!e && /matter_code|matter_number|matter_seq/.test(e.message ?? "");

export async function createMatterRow(matter: Matter): Promise<Matter> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();
  const code = codeOf(matter);

  const fields = {
      id: matter.id,
      org_id: orgId,
      client_id: matter.clientId,
      title: matter.title,
      description: matter.description,
      status: matter.status,
      category: matter.category,
      due_date: matter.dueDate,
      counterparty: matter.counterparty,
      blocker: matter.blocker,
      value: matter.value,
      billing_type: matter.billingType,
      hourly_rate: matter.hourlyRate,
      private_notes: matter.privateNotes,
  };
  let { data, error } = await supabase.from("matters").insert({ ...fields, matter_code: code }).select("*").single();
  if (missingNumberCols(error)) ({ data, error } = await supabase.from("matters").insert(fields).select("*").single());

  if (error) throw error;
  return toMatter(data as MatterRow);
}

// Next running number and the current year (for the preview in New matter).
export async function nextMatterNumber(): Promise<{ next: number; year: number }> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();
  const [{ data: last }, { data: org }] = await Promise.all([
    supabase.from("matters").select("matter_seq").eq("org_id", orgId).not("matter_seq", "is", null).order("matter_seq", { ascending: false }).limit(1),
    supabase.from("organizations").select("*").eq("id", orgId).maybeSingle(),
  ]);
  const o = (org ?? {}) as { timezone?: string; matter_number_start?: number };
  const lastSeq = Number((last as { matter_seq: number }[] | null)?.[0]?.matter_seq ?? 0);
  let year = new Date().getFullYear();
  try {
    year = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: o.timezone || "America/New_York" }).format(new Date()));
  } catch {
    /* unknown timezone: keep server year */
  }
  return { next: Math.max(lastSeq + 1, Number(o.matter_number_start ?? 1) || 1), year };
}

export async function updateMatterRow(id: string, matter: Matter): Promise<Matter> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const code = codeOf(matter);
  const fields = {
      client_id: matter.clientId,
      title: matter.title,
      description: matter.description,
      status: matter.status,
      category: matter.category,
      due_date: matter.dueDate,
      counterparty: matter.counterparty,
      blocker: matter.blocker,
      value: matter.value,
      billing_type: matter.billingType,
      hourly_rate: matter.hourlyRate,
      private_notes: matter.privateNotes,
      updated_at: new Date().toISOString(),
  };
  const run = (f: Record<string, unknown>) => supabase.from("matters").update(f).eq("id", id).eq("org_id", orgId).select("*").single();
  // A numbered matter keeps its number (the database enforces this too).
  let { data, error } = await run(code ? { ...fields, matter_code: code } : fields);
  if (code && missingNumberCols(error)) ({ data, error } = await run(fields));

  if (error) throw error;
  return toMatter(data as MatterRow);
}

export async function deleteMatterRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { error } = await supabase.from("matters").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}
