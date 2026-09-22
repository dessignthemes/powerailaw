import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultOrgId } from "@/lib/data/org";

// Everyone who logs in joins the single existing firm for now (no
// multi-tenant onboarding yet). The first person to ever log in becomes
// "owner"; everyone after that is a "member".
export async function ensureProfile(userId: string, email: string): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return;

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const role = !count || count === 0 ? "owner" : "member";

  const { error } = await supabase.from("profiles").insert({
    id: userId,
    org_id: orgId,
    email,
    role,
  });

  if (error) throw error;
}
