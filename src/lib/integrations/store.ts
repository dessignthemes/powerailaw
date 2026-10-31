import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Firm-wide integration keys (Dropbox Sign, Dropbox Fax…), encrypted at rest.
// The encryption key comes from INTEGRATIONS_KEY, or is derived from the
// server's Supabase service key, which never leaves the server.

export type OrgProvider = "dropbox_sign" | "dropbox_fax" | "quickbooks" | "remarkable";
export class IntegrationError extends Error {
  constructor(public status: 400 | 403 | 503, message: string) {
    super(message);
  }
}

const db = () => createAdminClient();
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /org_integrations/.test(e.message ?? ""));
export const setupError = () => new IntegrationError(503, "Integrations need a database update first (migration 0065).");

function key(): Buffer {
  const base = process.env.INTEGRATIONS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new IntegrationError(503, "The server isn't set up to store integration keys.");
  return createHash("sha256").update(`lawpower-integrations:${base}`).digest();
}
export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}
export function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown key format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export type OrgIntegration = { provider: OrgProvider; meta: Record<string, unknown>; connectedAt: string; connectedBy: string | null };

export async function listOrgIntegrations(orgId: string): Promise<{ items: OrgIntegration[]; ready: boolean }> {
  const { data, error } = await db().from("org_integrations").select("provider, meta, connected_at, connected_by").eq("org_id", orgId);
  if (error) {
    if (missing(error)) return { items: [], ready: false };
    throw error;
  }
  return { items: ((data ?? []) as { provider: OrgProvider; meta: Record<string, unknown>; connected_at: string; connected_by: string | null }[]).map((r) => ({ provider: r.provider, meta: r.meta ?? {}, connectedAt: r.connected_at, connectedBy: r.connected_by })), ready: true };
}

export async function saveOrgIntegration(orgId: string, userId: string, provider: OrgProvider, secret: string, meta: Record<string, unknown>) {
  const { error } = await db()
    .from("org_integrations")
    .upsert({ org_id: orgId, provider, secret_enc: encrypt(secret), meta, connected_by: userId, connected_at: new Date().toISOString() }, { onConflict: "org_id,provider" });
  if (error) {
    if (missing(error)) throw setupError();
    throw error;
  }
}

export async function removeOrgIntegration(orgId: string, provider: OrgProvider) {
  const { error } = await db().from("org_integrations").delete().eq("org_id", orgId).eq("provider", provider);
  if (error && !missing(error)) throw error;
}

// The decrypted key, for server code that calls the service.
export async function orgSecret(orgId: string, provider: OrgProvider): Promise<string | null> {
  const { data, error } = await db().from("org_integrations").select("secret_enc").eq("org_id", orgId).eq("provider", provider).maybeSingle();
  if (error || !data) return null;
  const enc = (data as { secret_enc: string | null }).secret_enc;
  return enc ? decrypt(enc) : null;
}

// Dropbox Sign (and Dropbox Fax, which uses the same API key): check the key and read the account.
export async function verifyDropboxSignKey(apiKey: string): Promise<{ email: string | null; accountId: string | null }> {
  const r = await fetch("https://api.hellosign.com/v3/account", { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` } }).catch(() => null);
  if (!r) throw new IntegrationError(400, "Dropbox Sign couldn't be reached. Please try again.");
  if (r.status === 401 || r.status === 403) throw new IntegrationError(400, "Dropbox Sign didn't accept that API key. Copy it again from Dropbox Sign → Settings → API.");
  if (!r.ok) throw new IntegrationError(400, `Dropbox Sign answered with an error (${r.status}). Please try again.`);
  const d = (await r.json().catch(() => ({}))) as { account?: { email_address?: string; account_id?: string } };
  return { email: d.account?.email_address ?? null, accountId: d.account?.account_id ?? null };
}
