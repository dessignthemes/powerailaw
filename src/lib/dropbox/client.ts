import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdForUser } from "@/lib/data/org";
import type { DropboxEntry } from "@/lib/dropbox/types";

// Read-only Dropbox access for the signed-in person. LawPower only lists,
// previews and copies files; it never changes anything in Dropbox.

export const DROPBOX_SCOPES = ["account_info.read", "files.metadata.read", "files.content.read"];
export const DROPBOX_MIGRATION = "0015_dropbox.sql";

export class DropboxError extends Error {
  constructor(
    public code: "not_configured" | "not_connected" | "reconnect" | "not_found" | "too_large" | "setup_required" | "provider_error",
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function dropboxConfigured() {
  return !!(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET);
}

export function redirectUri(origin: string) {
  return process.env.DROPBOX_REDIRECT_URI || `${origin}/api/dropbox/callback`;
}

type Conn = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  account_email: string | null;
  meta: { rootNamespaceId?: string; homeNamespaceId?: string; name?: string } | null;
};

async function getConnection(userId: string): Promise<Conn | null> {
  const { data, error } = await createAdminClient()
    .from("oauth_connections")
    .select("id, access_token, refresh_token, expires_at, account_email, meta")
    .eq("connected_by", userId)
    .eq("provider", "dropbox")
    .maybeSingle();
  if (error) {
    // Before 0015 the meta column doesn't exist; no Dropbox row can exist either.
    if (error.code === "42703" || /meta/.test(error.message)) return null;
    throw error;
  }
  return data as Conn | null;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.DROPBOX_CLIENT_ID!,
      client_secret: process.env.DROPBOX_CLIENT_SECRET!,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && !!data.access_token, data };
}

export async function exchangeCode(code: string, origin: string) {
  const { ok, data } = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!ok) {
    console.error("Dropbox code exchange failed:", data?.error, data?.error_description);
    throw new DropboxError("provider_error", "Dropbox didn't accept the sign-in. Please try connecting again.");
  }
  return data as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

const expiry = (seconds?: number) => new Date(Date.now() + (Number(seconds) || 14400) * 1000 - 60_000).toISOString();

// Saves (or replaces) the person's Dropbox connection after sign-in.
export async function saveConnection(userId: string, tok: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }) {
  const account = await rpc<{
    email?: string;
    name?: { display_name?: string };
    root_info?: { root_namespace_id?: string; home_namespace_id?: string };
  }>(tok.access_token, "users/get_current_account", null);
  const orgId = await getOrgIdForUser(userId);
  if (!orgId) throw new DropboxError("provider_error", "Your account isn't set up yet. Please sign out and sign in again.");

  const row: Record<string, unknown> = {
    org_id: orgId,
    provider: "dropbox",
    access_token: tok.access_token,
    expires_at: expiry(tok.expires_in),
    scopes: (tok.scope ?? DROPBOX_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
    connected_by: userId,
    account_email: account.email ?? null,
    meta: {
      rootNamespaceId: account.root_info?.root_namespace_id,
      homeNamespaceId: account.root_info?.home_namespace_id,
      name: account.name?.display_name,
    },
    updated_at: new Date().toISOString(),
  };
  if (tok.refresh_token) row.refresh_token = tok.refresh_token;

  const { error } = await createAdminClient().from("oauth_connections").upsert(row, { onConflict: "connected_by,provider" });
  if (error) {
    if (error.code === "23514" || error.code === "42703" || /provider_check|meta/.test(error.message)) {
      throw new DropboxError(
        "setup_required",
        `Dropbox needs a database update. Run supabase/migrations/${DROPBOX_MIGRATION} in the Supabase SQL editor, then connect again.`,
        503
      );
    }
    throw error;
  }
}

async function freshToken(conn: Conn): Promise<string> {
  if (conn.expires_at && new Date(conn.expires_at).getTime() > Date.now() + 60_000) return conn.access_token;
  if (!conn.refresh_token || !dropboxConfigured()) {
    throw new DropboxError("reconnect", "Your Dropbox connection has expired. Connect Dropbox again.", 401);
  }
  const { ok, data } = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
  if (!ok) {
    console.error("Dropbox token refresh failed:", data?.error, data?.error_description);
    throw new DropboxError("reconnect", "Your Dropbox connection has expired. Connect Dropbox again.", 401);
  }
  const expires_at = expiry(data.expires_in);
  await createAdminClient()
    .from("oauth_connections")
    .update({ access_token: data.access_token, expires_at, updated_at: new Date().toISOString() })
    .eq("id", conn.id);
  return data.access_token as string;
}

export type Session = { token: string; pathRoot: string | null; conn: Conn };

export async function dropboxSession(userId: string): Promise<Session> {
  if (!dropboxConfigured()) throw new DropboxError("not_configured", "Dropbox isn't set up yet.", 503);
  const conn = await getConnection(userId);
  if (!conn) throw new DropboxError("not_connected", "Connect your Dropbox first.", 401);
  const token = await freshToken(conn);
  // On Dropbox Business the team space root holds team folders as well as
  // the person's own folder, like dropbox.com shows it.
  const m = conn.meta ?? {};
  const pathRoot =
    m.rootNamespaceId && m.homeNamespaceId && m.rootNamespaceId !== m.homeNamespaceId
      ? JSON.stringify({ ".tag": "root", root: m.rootNamespaceId })
      : null;
  return { token, pathRoot, conn };
}

export async function getStatus(userId: string) {
  if (!dropboxConfigured()) return { configured: false as const };
  const conn = await getConnection(userId);
  if (!conn) return { configured: true as const, connected: false as const };
  const m = conn.meta ?? {};
  return {
    configured: true as const,
    connected: true as const,
    email: conn.account_email,
    name: m.name ?? null,
    teamSpace: !!(m.rootNamespaceId && m.homeNamespaceId && m.rootNamespaceId !== m.homeNamespaceId),
  };
}

export async function disconnect(userId: string) {
  const conn = await getConnection(userId);
  if (!conn) return;
  // Revoke at Dropbox too; if that fails the token still gets deleted here.
  await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.access_token}` },
  }).catch(() => {});
  await createAdminClient().from("oauth_connections").delete().eq("id", conn.id);
}

// ── API calls ─────────────────────────────────────────────────────────────

function headers(token: string, pathRoot: string | null, extra: Record<string, string> = {}) {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, ...extra };
  if (pathRoot) h["Dropbox-API-Path-Root"] = pathRoot;
  return h;
}

// Dropbox-API-Arg is an HTTP header, so non-ASCII (e.g. "ą") must be escaped.
export function apiArg(arg: unknown) {
  return JSON.stringify(arg).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

async function failure(res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  if (res.status === 401) throw new DropboxError("reconnect", "Your Dropbox connection has expired. Connect Dropbox again.", 401);
  if (/not_found/.test(text)) throw new DropboxError("not_found", "That file or folder isn't in your Dropbox anymore.", 404);
  if (res.status === 429) throw new DropboxError("provider_error", "Dropbox is busy right now. Please try again in a moment.", 503);
  console.error("Dropbox API error:", res.status, text.slice(0, 300));
  throw new DropboxError("provider_error", "Dropbox couldn't complete that request. Please try again.", 502);
}

async function rpc<T>(token: string, endpoint: string, body: unknown, pathRoot: string | null = null): Promise<T> {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: "POST",
    headers: headers(token, pathRoot, body === null ? {} : { "Content-Type": "application/json" }),
    body: body === null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) await failure(res);
  return (await res.json()) as T;
}

type Meta = {
  ".tag": "file" | "folder" | "deleted";
  id?: string;
  name: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  server_modified?: string;
  is_downloadable?: boolean;
};

function toEntry(m: Meta): DropboxEntry | null {
  if (m[".tag"] === "deleted" || !m.path_display) return null;
  return {
    id: m.id ?? m.path_lower ?? m.path_display,
    type: m[".tag"] === "folder" ? "folder" : "file",
    name: m.name,
    path: m.path_display,
    size: m[".tag"] === "file" ? m.size ?? null : null,
    modified: m.server_modified ?? null,
  };
}

const sortEntries = (list: DropboxEntry[]) =>
  list.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.type === "folder" ? -1 : 1));

export async function listFolder(s: Session, path: string, cursor?: string | null) {
  const data = cursor
    ? await rpc<{ entries: Meta[]; cursor: string; has_more: boolean }>(s.token, "files/list_folder/continue", { cursor }, s.pathRoot)
    : await rpc<{ entries: Meta[]; cursor: string; has_more: boolean }>(
        s.token,
        "files/list_folder",
        { path: path === "/" ? "" : path, limit: 500, include_non_downloadable_files: false },
        s.pathRoot
      );
  const entries = sortEntries(data.entries.map(toEntry).filter((e): e is DropboxEntry => !!e));
  return { entries, cursor: data.has_more ? data.cursor : null };
}

export async function search(s: Session, query: string, path: string) {
  const data = await rpc<{ matches: { metadata: { metadata: Meta } }[] }>(
    s.token,
    "files/search_v2",
    { query, options: { max_results: 100, file_status: "active", ...(path && path !== "/" ? { path } : {}) } },
    s.pathRoot
  );
  return data.matches.map((m) => toEntry(m.metadata.metadata)).filter((e): e is DropboxEntry => !!e);
}

// A direct link the browser can read for 4 hours (for previews).
export async function temporaryLink(s: Session, path: string) {
  const data = await rpc<{ link: string; metadata: Meta }>(s.token, "files/get_temporary_link", { path }, s.pathRoot);
  return { link: data.link, size: data.metadata.size ?? 0, name: data.metadata.name };
}

export async function download(s: Session, path: string, maxBytes: number) {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: headers(s.token, s.pathRoot, { "Dropbox-API-Arg": apiArg({ path }) }),
  });
  if (!res.ok) await failure(res);
  const meta = JSON.parse(res.headers.get("dropbox-api-result") ?? "{}") as Meta;
  if ((meta.size ?? 0) > maxBytes || Number(res.headers.get("content-length") ?? 0) > maxBytes) {
    await res.body?.cancel();
    throw new DropboxError("too_large", "This file is larger than 25 MB, so it can't be added to LawPower.", 413);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new DropboxError("too_large", "This file is larger than 25 MB, so it can't be added to LawPower.", 413);
  return { bytes, name: meta.name ?? path.split("/").pop() ?? "file" };
}
