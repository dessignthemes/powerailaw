import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// There's no login/multi-org support yet, so every request operates against
// a single seeded organization. Once real auth lands, replace this with
// "look up org_id from the authenticated user's profile" instead.
let cachedOrgId: string | null = null;

export async function getDefaultOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;

  const supabase = createAdminClient();

  const { data: existing, error: selectError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    cachedOrgId = existing.id;
    return existing.id;
  }

  const { data: created, error: insertError } = await supabase
    .from("organizations")
    .insert({ name: "PowerAI Law" })
    .select("id")
    .single();

  if (insertError) throw insertError;

  cachedOrgId = created.id;
  return created.id;
}
