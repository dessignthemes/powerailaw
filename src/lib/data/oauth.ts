import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultOrgId } from "@/lib/data/org";

export async function saveOAuthConnection(params: {
  provider: "google" | "microsoft";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  connectedBy: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const { error } = await supabase.from("oauth_connections").upsert(
    {
      org_id: orgId,
      provider: params.provider,
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
      expires_at: params.expiresAt,
      scopes: params.scopes,
      connected_by: params.connectedBy,
    },
    { onConflict: "org_id,provider" }
  );

  if (error) throw error;
}
