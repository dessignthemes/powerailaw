import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { getOrgIdForUser } from "@/lib/data/org";

export class TriageError extends Error {
  constructor(public status: 400 | 401 | 403 | 404, message: string) {
    super(message);
  }
}

type Provider = "google" | "microsoft";
const isProvider = (p: unknown): p is Provider => p === "google" || p === "microsoft";
const FOLDER_ID = /^[A-Za-z0-9=+/_-]{1,400}$/;

async function me() {
  const user = await getSessionUser();
  if (!user) throw new TriageError(401, "Please sign in again.");
  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) throw new TriageError(403, "Your account isn't set up yet. Please sign out and sign in again.");
  return { userId: user.id, orgId };
}

export type TriageSettings = { provider: Provider; folderId: string; folderName: string } | null;
export type TriageItem = { provider: Provider; messageId: string; status: "task" | "dismissed"; taskId: string | null };

export async function getTriage(): Promise<{ settings: TriageSettings; items: TriageItem[] }> {
  const { userId } = await me();
  const db = createAdminClient();
  const [{ data: p, error: pErr }, { data: rows, error: rErr }] = await Promise.all([
    db.from("profiles").select("triage_provider, triage_folder_id, triage_folder_name").eq("id", userId).single(),
    db.from("triage_items").select("provider, message_id, status, task_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(2000),
  ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  const settings =
    p?.triage_provider && p.triage_folder_id
      ? { provider: p.triage_provider as Provider, folderId: p.triage_folder_id as string, folderName: (p.triage_folder_name as string) ?? "Folder" }
      : null;
  return {
    settings,
    items: (rows ?? []).map((r) => ({ provider: r.provider as Provider, messageId: r.message_id as string, status: r.status as "task" | "dismissed", taskId: (r.task_id as string) ?? null })),
  };
}

export async function saveTriageFolder(input: { provider?: unknown; folderId?: unknown; folderName?: unknown }) {
  const { userId } = await me();
  if (!isProvider(input.provider)) throw new TriageError(400, "Choose Outlook or Gmail.");
  const folderId = String(input.folderId ?? "");
  if (!FOLDER_ID.test(folderId)) throw new TriageError(400, "Choose a folder.");
  const folderName = String(input.folderName ?? "").trim().slice(0, 120) || "Folder";
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ triage_provider: input.provider, triage_folder_id: folderId, triage_folder_name: folderName })
    .eq("id", userId);
  if (error) throw error;
  return { provider: input.provider, folderId, folderName };
}

export async function markTriaged(input: { provider?: unknown; messageId?: unknown; status?: unknown; taskId?: unknown }) {
  const { userId, orgId } = await me();
  if (!isProvider(input.provider)) throw new TriageError(400, "Unknown mailbox.");
  const messageId = String(input.messageId ?? "");
  if (!messageId || messageId.length > 400) throw new TriageError(400, "Unknown email.");
  const status = input.status === "dismissed" ? "dismissed" : "task";
  const taskId = typeof input.taskId === "string" && /^[0-9a-f-]{36}$/i.test(input.taskId) ? input.taskId : null;
  const { error } = await createAdminClient()
    .from("triage_items")
    .upsert({ org_id: orgId, user_id: userId, provider: input.provider, message_id: messageId, status, task_id: status === "task" ? taskId : null }, { onConflict: "user_id,provider,message_id" });
  if (error) throw error;
}

// "Put back": the email shows up in Triage again (a created task is kept).
export async function unmarkTriaged(provider: unknown, messageId: unknown) {
  const { userId } = await me();
  if (!isProvider(provider)) throw new TriageError(400, "Unknown mailbox.");
  await createAdminClient().from("triage_items").delete().eq("user_id", userId).eq("provider", provider).eq("message_id", String(messageId ?? ""));
}
