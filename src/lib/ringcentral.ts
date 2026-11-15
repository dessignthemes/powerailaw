import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/integrations/store";

// RingCentral (migration 0073): each person signs in with RingCentral once;
// texts from a matter then go out from their RingCentral number, and are saved
// to the matter. Needs LawPower's RingCentral app keys in the server settings:
// RINGCENTRAL_CLIENT_ID and RINGCENTRAL_CLIENT_SECRET (RINGCENTRAL_SERVER
// optional, for RingCentral's test environment).

const db = () => createAdminClient();
export const rcServer = () => (process.env.RINGCENTRAL_SERVER || "https://platform.ringcentral.com").replace(/\/$/, "");
export const rcConfigured = () => !!(process.env.RINGCENTRAL_CLIENT_ID && process.env.RINGCENTRAL_CLIENT_SECRET);
const basic = () => `Basic ${Buffer.from(`${process.env.RINGCENTRAL_CLIENT_ID}:${process.env.RINGCENTRAL_CLIENT_SECRET}`).toString("base64")}`;

export class RingCentralError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number };
async function tokenCall(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(`${rcServer()}/restapi/oauth/token`, {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new RingCentralError(r.status === 400 ? 401 : 502, (d as { error_description?: string }).error_description ?? "RingCentral didn't accept the sign-in. Please connect again.");
  return d as Tokens;
}

export function authorizeUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({ response_type: "code", client_id: process.env.RINGCENTRAL_CLIENT_ID ?? "", redirect_uri: redirectUri, state });
  return `${rcServer()}/restapi/oauth/authorize?${q}`;
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${rcServer()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (d as { message?: string; errors?: { message?: string }[] }).errors?.[0]?.message ?? (d as { message?: string }).message;
    throw new RingCentralError(r.status === 401 ? 401 : 502, msg ? `RingCentral: ${msg}` : "RingCentral couldn't do that. Please try again.");
  }
  return d as T;
}

// After RingCentral's sign-in: keep the tokens and find the number texts go from.
export async function finishConnect(orgId: string, userId: string, code: string, redirectUri: string) {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  let fromNumber: string | null = null;
  let accountName: string | null = null;
  try {
    const nums = await api<{ records?: { phoneNumber: string; features?: string[] }[] }>(t.access_token, "/restapi/v1.0/account/~/extension/~/phone-number?perPage=100");
    fromNumber = (nums.records ?? []).find((n) => (n.features ?? []).includes("SmsSender"))?.phoneNumber ?? null;
    const me = await api<{ name?: string; contact?: { email?: string } }>(t.access_token, "/restapi/v1.0/account/~/extension/~");
    accountName = me.contact?.email ?? me.name ?? null;
  } catch {
    // Saved anyway; the number is looked up again when texting.
  }
  const now = Date.now();
  const { error } = await db()
    .from("ringcentral_connections")
    .upsert({
      user_id: userId,
      org_id: orgId,
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : null,
      expires_at: new Date(now + (t.expires_in ?? 3600) * 1000).toISOString(),
      refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : null,
      from_number: fromNumber,
      account_name: accountName,
      connected_at: new Date(now).toISOString(),
    });
  if (error) throw new RingCentralError(503, "RingCentral needs a database update first (migration 0073).");
}

type Row = { user_id: string; access_token: string; refresh_token: string | null; expires_at: string | null; from_number: string | null; account_name: string | null };
async function connection(userId: string): Promise<Row | null> {
  const { data, error } = await db().from("ringcentral_connections").select("*").eq("user_id", userId).maybeSingle();
  return error ? null : (data as Row | null);
}

export async function rcStatus(userId: string) {
  const c = rcConfigured() ? await connection(userId) : null;
  return { configured: rcConfigured(), connected: !!c, fromNumber: c?.from_number ?? null, account: c?.account_name ?? null };
}

export async function disconnect(userId: string) {
  await db().from("ringcentral_connections").delete().eq("user_id", userId);
}

async function accessToken(userId: string): Promise<{ token: string; row: Row }> {
  const row = await connection(userId);
  if (!row) throw new RingCentralError(409, "Connect RingCentral first (Settings → Integrations → RingCentral).");
  if (row.expires_at && Date.parse(row.expires_at) > Date.now() + 60_000) return { token: decrypt(row.access_token), row };
  if (!row.refresh_token) throw new RingCentralError(401, "Your RingCentral sign-in expired. Please connect RingCentral again.");
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: decrypt(row.refresh_token) });
  await db()
    .from("ringcentral_connections")
    .update({
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : row.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    })
    .eq("user_id", userId);
  return { token: t.access_token, row };
}

// "(732) 555-0100" → "+17325550100" (US numbers without a country code).
export function e164(phone: string): string | null {
  const t = phone.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Send a text from the person's RingCentral number.
export async function sendSms(userId: string, to: string, text: string) {
  const num = e164(to);
  if (!num) throw new RingCentralError(400, "That phone number doesn't look right. Use a 10-digit US number, or +country code.");
  if (!text.trim()) throw new RingCentralError(400, "Type the message first.");
  const { token, row } = await accessToken(userId);
  let from = row.from_number;
  if (!from) {
    const nums = await api<{ records?: { phoneNumber: string; features?: string[] }[] }>(token, "/restapi/v1.0/account/~/extension/~/phone-number?perPage=100");
    from = (nums.records ?? []).find((n) => (n.features ?? []).includes("SmsSender"))?.phoneNumber ?? null;
    if (!from) throw new RingCentralError(409, "Your RingCentral user has no number that can send texts. Ask your RingCentral admin to turn on SMS for your number.");
    await db().from("ringcentral_connections").update({ from_number: from }).eq("user_id", userId);
  }
  await api(token, "/restapi/v1.0/account/~/extension/~/sms", { method: "POST", body: JSON.stringify({ from: { phoneNumber: from }, to: [{ phoneNumber: num }], text: text.slice(0, 1000) }) });
  return { from, to: num };
}
