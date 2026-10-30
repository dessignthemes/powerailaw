import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/data/org";
import type { Matter } from "@/components/NewMatterModal";
import { NUMBER_PATTERN, cleanCode, cleanNumber, formatMatterNumber, isValidCode } from "@/lib/matters/numbering";
import { getSessionUserId } from "@/lib/auth";
import { notifyAssigned } from "@/lib/data/notifications";

// "Assigned to" is stored as the team member's profile id and shown as their email.
async function teamEmails(orgId: string): Promise<Map<string, string>> {
  const { data } = await createAdminClient().from("profiles").select("id, email").eq("org_id", orgId);
  return new Map(((data ?? []) as { id: string; email: string }[]).map((p) => [p.id, p.email]));
}
function assigneeId(emails: Map<string, string>, email: string | null | undefined): string | null {
  if (!email) return null;
  const want = email.trim().toLowerCase();
  for (const [id, e] of emails) if (e.toLowerCase() === want) return id;
  return null;
}

export class MatterInputError extends Error {
  status = 400 as const;
}

type MatterRow = {
  id: string;
  assigned_to?: string | null;
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

function toMatter(row: MatterRow, emails?: Map<string, string>): Matter {
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
    assignedTo: (row.assigned_to && emails?.get(row.assigned_to)) || null,
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
  const emails = await teamEmails(orgId);
  return (data as MatterRow[]).map((r) => toMatter(r, emails));
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
  const emails = await teamEmails(orgId);
  const actorId = await getSessionUserId();

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
      assigned_to: assigneeId(emails, matter.assignedTo),
  };
  const insert = (extra: Record<string, unknown>) => supabase.from("matters").insert({ ...fields, ...extra }).select("*").single();
  let { data, error } = code || matter.matterNumber ? await saveNumbered(orgId, code ?? "", matter.matterNumber, undefined, insert) : await insert({});
  if (missingNumberCols(error)) ({ data, error } = await insert({}));

  if (error) throw error;
  const saved = toMatter(data as MatterRow, emails);
  await notifyAssigned({ orgId, actorId, kind: "matter_assigned", refId: saved.id, title: saved.matterNumber ? `${saved.matterNumber} · ${saved.title}` : saved.title, to: (data as MatterRow).assigned_to });
  return saved;
}

// The highest running number used so far: LawPower's own counter AND the last
// part of numbers kept from an import (e.g. REP-2026-3708 → 3708), so a new
// matter continues straight after the last one.
async function highestNumber(orgId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("matters").select("matter_seq, matter_number").eq("org_id", orgId).limit(50000);
  let max = 0;
  for (const r of (data ?? []) as { matter_seq: number | null; matter_number: string | null }[]) {
    if (r.matter_seq && r.matter_seq > max) max = r.matter_seq;
    const tail = r.matter_number?.match(/-(\d{1,9})$/)?.[1];
    if (tail && Number(tail) > max) max = Number(tail);
  }
  return max;
}

async function firmYearAndStart(orgId: string) {
  const { data: org } = await createAdminClient().from("organizations").select("*").eq("id", orgId).maybeSingle();
  const o = (org ?? {}) as { timezone?: string; matter_number_start?: number };
  let year = new Date().getFullYear();
  try {
    year = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: o.timezone || "America/New_York" }).format(new Date()));
  } catch {
    /* unknown timezone: keep server year */
  }
  return { year, start: Number(o.matter_number_start ?? 1) || 1 };
}

// Next running number and the current year (for the preview in New matter).
export async function nextMatterNumber(): Promise<{ next: number; year: number }> {
  const orgId = await getCurrentOrgId();
  const [last, { year, start }] = await Promise.all([highestNumber(orgId), firmYearAndStart(orgId)]);
  return { next: Math.max(last + 1, start), year };
}

// Whether a matter number is already used in this firm (except one matter).
export async function matterNumberTaken(raw: string, exceptId?: string | null) {
  const orgId = await getCurrentOrgId();
  let q = createAdminClient().from("matters").select("id").eq("org_id", orgId).eq("matter_number", cleanNumber(raw)).limit(1);
  if (exceptId && /^[0-9a-f-]{36}$/i.test(exceptId)) q = q.neq("id", exceptId);
  const { data } = await q;
  return !!data?.length;
}

// A number someone typed instead of the next one: right format and not in use.
async function checkOwnNumber(orgId: string, raw: unknown, exceptId?: string) {
  const number = cleanNumber(raw);
  if (!NUMBER_PATTERN.test(number)) throw new MatterInputError("Type the matter number like REP-2026-3709.");
  let q = createAdminClient().from("matters").select("id").eq("org_id", orgId).eq("matter_number", number).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q;
  if (data?.length) throw new MatterInputError(`${number} is already used by another matter. Choose a different number.`);
  return { number, code: number.split("-")[0] };
}

// Saves with a matter number: the one typed, or the next after the highest.
// If two people create a matter at the same moment, the second one simply gets
// the following number.
async function saveNumbered<T>(
  orgId: string,
  code: string,
  own: unknown,
  exceptId: string | undefined,
  save: (n: { matter_number: string; matter_code: string }) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
) {
  if (own) {
    const n = await checkOwnNumber(orgId, own, exceptId);
    const res = await save({ matter_number: n.number, matter_code: n.code });
    if (res.error?.code === "23505") throw new MatterInputError(`${n.number} is already used by another matter. Choose a different number.`);
    return res;
  }
  const { year, start } = await firmYearAndStart(orgId);
  let res: { data: T | null; error: { code?: string; message?: string } | null } = { data: null, error: null };
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = Math.max((await highestNumber(orgId)) + 1, start) + attempt;
    res = await save({ matter_number: formatMatterNumber(code, year, next), matter_code: code });
    if (res.error?.code !== "23505") return res;
  }
  return res;
}

export async function updateMatterRow(id: string, matter: Matter): Promise<Matter> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const code = codeOf(matter);
  const emails = await teamEmails(orgId);
  const actorId = await getSessionUserId();
  const { data: before } = await supabase.from("matters").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  const hadNumber = !!(before as { matter_number?: string | null } | null)?.matter_number;
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
      assigned_to: assigneeId(emails, matter.assignedTo),
      updated_at: new Date().toISOString(),
  };
  const run = (f: Record<string, unknown>) => supabase.from("matters").update(f).eq("id", id).eq("org_id", orgId).select("*").single();
  // A numbered matter keeps its number (the database enforces this too).
  let { data, error } =
    !hadNumber && (code || matter.matterNumber)
      ? await saveNumbered(orgId, code ?? "", matter.matterNumber, id, (n) => run({ ...fields, ...n }))
      : await run(code && !hadNumber ? { ...fields, matter_code: code } : fields);
  if ((code || matter.matterNumber) && missingNumberCols(error)) ({ data, error } = await run(fields));

  if (error) throw error;
  const saved = toMatter(data as MatterRow, emails);
  await notifyAssigned({
    orgId,
    actorId,
    kind: "matter_assigned",
    refId: saved.id,
    title: saved.matterNumber ? `${saved.matterNumber} · ${saved.title}` : saved.title,
    to: (data as MatterRow).assigned_to,
    before: (before as { assigned_to?: string | null } | null)?.assigned_to ?? null,
  });
  return saved;
}

export async function deleteMatterRows(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getCurrentOrgId();

  const { error } = await supabase.from("matters").delete().eq("org_id", orgId).in("id", ids);
  if (error) throw error;
}

// Give a matter a different number (the pencil next to the number). The new
// number must look like REP-2026-3709 and not be used by another matter.
export async function renumberMatter(id: string, raw: unknown): Promise<Matter> {
  const orgId = await getCurrentOrgId();
  const n = await checkOwnNumber(orgId, raw, id);
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("matters").update({ matter_number: n.number, matter_code: n.code, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId).select("*").maybeSingle();
  if (error?.code === "23505") throw new MatterInputError(`${n.number} is already used by another matter. Choose a different number.`);
  if (error) {
    if (missingNumberCols(error)) throw new MatterInputError("Matter numbers need a database update first (migration 0025).");
    throw error;
  }
  if (!data) throw new MatterInputError("That matter wasn't found.");
  const saved = data as MatterRow;
  // Before migration 0062 the database keeps the old number: say so instead of pretending.
  if (saved.matter_number !== n.number) throw new MatterInputError("Changing a matter's number needs a database update first (migration 0062).");
  return toMatter(saved, await teamEmails(orgId));
}
