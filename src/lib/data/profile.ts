import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// First sign-in creates a private workspace for this account, with the
// person as its owner. Nobody is added to anyone else's workspace
// automatically; sharing a workspace will need an explicit invite.
export async function ensureProfile(userId: string, email: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase.from("profiles").select("org_id").eq("id", userId).maybeSingle();
  if (existing) return existing.org_id as string;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: email || "My workspace" })
    .select("id")
    .single();
  if (orgError) throw orgError;

  const { error } = await supabase.from("profiles").insert({ id: userId, org_id: org.id, email, role: "owner" });
  if (error) {
    // Two sign-ins racing: keep whichever profile won and drop our spare org.
    await supabase.from("organizations").delete().eq("id", org.id);
    const { data: again } = await supabase.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    if (again) return again.org_id as string;
    throw error;
  }
  return org.id as string;
}
