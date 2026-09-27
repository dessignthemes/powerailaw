import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// First sign-in creates a private workspace for this account, with the
// person as its owner. Nobody is added to anyone else's workspace
// automatically; sharing a workspace will need an explicit invite.
export async function ensureProfile(userId: string, email: string, fullName?: string | null): Promise<string> {
  const supabase = createAdminClient();
  const name = fullName?.trim() ? fullName.trim().slice(0, 120) : null;

  const { data: existing } = await supabase.from("profiles").select("org_id").eq("id", userId).maybeSingle();
  if (existing) {
    // Keep the name current (used for initials). Ignored if the column isn't there yet.
    if (name) await supabase.from("profiles").update({ full_name: name }).eq("id", userId).then(() => undefined, () => undefined);
    return existing.org_id as string;
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: email || "My workspace" })
    .select("id")
    .single();
  if (orgError) throw orgError;

  let { error } = await supabase.from("profiles").insert({ id: userId, org_id: org.id, email, role: "owner", ...(name ? { full_name: name } : {}) });
  // Before 0009 is run there's no full_name column; create the profile without it.
  if (error && name && /full_name/.test(error.message ?? "")) {
    ({ error } = await supabase.from("profiles").insert({ id: userId, org_id: org.id, email, role: "owner" }));
  }
  if (error) {
    // Two sign-ins racing: keep whichever profile won and drop our spare org.
    await supabase.from("organizations").delete().eq("id", org.id);
    const { data: again } = await supabase.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    if (again) return again.org_id as string;
    throw error;
  }
  return org.id as string;
}
