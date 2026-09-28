import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { getOrgIdForUser } from "@/lib/data/org";

export class TimeError extends Error {
  constructor(public status: 400 | 401 | 403 | 404, message: string) {
    super(message);
  }
}

export type TimeEntry = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  description: string;
  matterId: string | null;
  taskId: string | null;
  billable: boolean;
  rate: number | null; // dollars per hour
  source: "manual" | "timer";
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string;
  entry_date: string;
  started_at: string | null;
  ended_at: string | null;
  minutes: number;
  description: string;
  matter_id: string | null;
  task_id: string | null;
  billable: boolean;
  rate_cents: number | null;
  source: "manual" | "timer";
  created_at: string;
};

const toEntry = (r: Row): TimeEntry => ({
  id: r.id,
  userId: r.user_id,
  date: r.entry_date,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  minutes: r.minutes,
  description: r.description,
  matterId: r.matter_id,
  taskId: r.task_id,
  billable: r.billable,
  rate: r.rate_cents === null ? null : r.rate_cents / 100,
  source: r.source,
  createdAt: r.created_at,
});

async function me() {
  const user = await getSessionUser();
  if (!user) throw new TimeError(401, "Please sign in again.");
  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) throw new TimeError(403, "Your account isn't set up yet. Please sign out and sign in again.");
  return { userId: user.id, orgId };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function listTimeEntries(q: { from?: string | null; to?: string | null; everyone?: boolean; taskId?: string | null }) {
  const { userId, orgId } = await me();
  let query = createAdminClient().from("time_entries").select("*").eq("org_id", orgId);
  if (!q.everyone) query = query.eq("user_id", userId);
  if (q.from && YMD.test(q.from)) query = query.gte("entry_date", q.from);
  if (q.to && YMD.test(q.to)) query = query.lte("entry_date", q.to);
  if (q.taskId) query = query.eq("task_id", q.taskId);
  const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data as Row[]).map(toEntry);
}

// Keeps a matter/task id only if it belongs to this workspace.
async function inOrg(table: "matters" | "tasks", orgId: string, id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from(table).select("id").eq("id", id).eq("org_id", orgId).maybeSingle();
  return data ? (data.id as string) : null;
}

async function fields(orgId: string, b: Record<string, unknown>) {
  const date = String(b.date ?? "");
  if (!YMD.test(date)) throw new TimeError(400, "Choose a date.");
  const minutes = Math.round(Number(b.minutes));
  if (!Number.isFinite(minutes) || minutes < 1) throw new TimeError(400, "Enter how long you worked (at least 1 minute).");
  if (minutes > 1440) throw new TimeError(400, "An entry can be at most 24 hours.");
  const iso = (v: unknown) => (typeof v === "string" && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const rate = b.rate === null || b.rate === undefined || b.rate === "" ? null : Number(b.rate);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100000)) throw new TimeError(400, "Check the hourly rate.");
  return {
    entry_date: date,
    started_at: iso(b.startedAt),
    ended_at: iso(b.endedAt),
    minutes,
    description: String(b.description ?? "").trim().slice(0, 2000),
    matter_id: await inOrg("matters", orgId, b.matterId),
    task_id: await inOrg("tasks", orgId, b.taskId),
    billable: b.billable !== false,
    rate_cents: rate === null ? null : Math.round(rate * 100),
  };
}

export async function createTimeEntry(b: Record<string, unknown>): Promise<TimeEntry> {
  const { userId, orgId } = await me();
  const { data, error } = await createAdminClient()
    .from("time_entries")
    .insert({ org_id: orgId, user_id: userId, ...(await fields(orgId, b)), source: b.source === "timer" ? "timer" : "manual" })
    .select("*")
    .single();
  if (error) throw error;
  return toEntry(data as Row);
}

// People can only edit their own entries.
export async function updateTimeEntry(id: string, b: Record<string, unknown>): Promise<TimeEntry> {
  const { userId, orgId } = await me();
  const { data, error } = await createAdminClient()
    .from("time_entries")
    .update(await fields(orgId, b))
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TimeError(404, "You can only edit your own time entries.");
  return toEntry(data as Row);
}

// People can only delete their own entries.
export async function deleteTimeEntry(id: string) {
  const { userId, orgId } = await me();
  const { data, error } = await createAdminClient().from("time_entries").delete().eq("id", id).eq("org_id", orgId).eq("user_id", userId).select("id");
  if (error) throw error;
  if (!data?.length) throw new TimeError(404, "You can only delete your own time entries.");
}
