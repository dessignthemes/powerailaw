import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Merging two duplicate records: the database function merge_records
// (migration 0076) moves everything from the removed record to the kept one,
// fills the kept one's empty fields and removes the duplicate, in one go.

export type MergeKind = "matters" | "clients" | "contacts";
export const MERGE_KINDS: MergeKind[] = ["matters", "clients", "contacts"];

export class MergeError extends Error {
  constructor(public status: 400 | 404 | 409 | 500, message: string) {
    super(message);
  }
}

export async function mergeRecords(orgId: string, kind: MergeKind, keepId: string, dropId: string): Promise<{ moved: number; tables: Record<string, number> }> {
  if (!MERGE_KINDS.includes(kind)) throw new MergeError(400, "Unknown record type.");
  if (!keepId || !dropId || keepId === dropId) throw new MergeError(400, "Pick two different records to merge.");
  const { data, error } = await createAdminClient().rpc("merge_records", { p_kind: kind, p_org: orgId, p_keep: keepId, p_drop: dropId });
  if (error) {
    // The function isn't there yet: migration 0076 hasn't been run.
    if (error.code === "PGRST202" || /merge_records/.test(error.message) && /not find|does not exist/i.test(error.message)) {
      throw new MergeError(409, "Merging needs a one-time database update (migration 0076). Please ask whoever manages LawPower to run it, then try again.");
    }
    if (/wasn't found/.test(error.message)) throw new MergeError(404, "One of the records wasn't found. It may have been merged or deleted already: reload the page.");
    console.error("merge_records failed:", error);
    throw new MergeError(500, "The records couldn't be merged. Nothing was changed. Please try again.");
  }
  const d = (data ?? {}) as { moved?: number; tables?: Record<string, number> };
  return { moved: d.moved ?? 0, tables: d.tables ?? {} };
}
