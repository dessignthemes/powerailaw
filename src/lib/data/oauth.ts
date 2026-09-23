import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultOrgId } from "@/lib/data/org";

export type MailProvider = "google" | "microsoft";

// One connection per person per provider (see 0004_personal_mail_connections.sql).
export async function saveOAuthConnection(params: {
  provider: MailProvider;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  connectedBy: string;
  accountEmail: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const orgId = await getDefaultOrgId();

  const row: Record<string, unknown> = {
    org_id: orgId,
    provider: params.provider,
    access_token: params.accessToken,
    expires_at: params.expiresAt,
    scopes: params.scopes,
    connected_by: params.connectedBy,
    account_email: params.accountEmail,
    updated_at: new Date().toISOString(),
  };
  // Google only returns a refresh token on the consent screen; don't wipe a
  // stored one when a later login doesn't include it.
  if (params.refreshToken) row.refresh_token = params.refreshToken;

  const { error } = await supabase
    .from("oauth_connections")
    .upsert(row, { onConflict: "connected_by,provider" });

  if (error) throw error;
}

export type ConnectionRow = {
  id: string;
  provider: MailProvider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  account_email: string | null;
};

export async function getUserConnections(userId: string): Promise<ConnectionRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("oauth_connections")
    .select("id, provider, access_token, refresh_token, expires_at, scopes, account_email")
    .eq("connected_by", userId);
  if (error) throw error;
  return (data ?? []) as ConnectionRow[];
}

export async function updateConnectionTokens(
  id: string,
  fields: { access_token: string; expires_at: string; refresh_token?: string }
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("oauth_connections")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteConnection(userId: string, provider: MailProvider) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("oauth_connections")
    .delete()
    .eq("connected_by", userId)
    .eq("provider", provider);
  if (error) throw error;
}
