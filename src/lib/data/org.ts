import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";

export class NoWorkspaceError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

// The workspace (organization) of the signed-in user, from their profile.
// Every data read and write is scoped to this — never to a shared default.
export async function getCurrentOrgId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new NoWorkspaceError(401, "Please sign in again.");
  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) throw new NoWorkspaceError(403, "Your account isn't set up yet. Please sign out and sign in again.");
  return orgId;
}

export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("profiles").select("org_id").eq("id", userId).maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}
