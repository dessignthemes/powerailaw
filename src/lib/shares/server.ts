import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import {
  SHARES_BUCKET,
  MAX_FILE_BYTES,
  MAX_FILES_REQUEST,
  MAX_FILES_SEND,
  SHARE_DAYS,
  type Share,
  type ShareEvent,
  type ShareFile,
  type ShareKind,
} from "./types";

export const SHARES_MIGRATION = "0023_secure_file_shares.sql";
const MAX_FAILED = 10;

export class ShareError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 503, message: string, public code?: string) {
    super(message);
  }
}

const db = () => createAdminClient();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "42P01" || /file_share/.test(e.message ?? ""));
const setupError = () =>
  new ShareError(503, `Secure Files needs a database update. Run supabase/migrations/${SHARES_MIGRATION} in the Supabase SQL editor, then try again.`, "setup_required");

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const got = scryptSync(pw, Buffer.from(salt, "hex"), 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

const cleanText = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanName = (v: unknown) =>
  String(v ?? "file")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .trim()
    .slice(0, 180) || "file";

type ShareRow = {
  id: string; org_id: string; kind: ShareKind; title: string; message: string; recipient_email: string | null; token_hash: string;
  password_hash: string | null; failed_attempts: number; created_at: string; created_by_email: string | null; expires_at: string;
  revoked_at: string | null; purged_at: string | null; last_opened_at: string | null; open_count: number;
};
type FileRow = { id: string; share_id: string; name: string; size: number; mime: string; storage_path: string; added_by: "firm" | "recipient"; status: string; download_count: number; created_at: string };

const statusOf = (r: ShareRow): Share["status"] => (r.revoked_at ? "cancelled" : r.purged_at || new Date(r.expires_at) <= new Date() ? "expired" : "active");
const toFile = (f: FileRow): ShareFile => ({ id: f.id, name: f.name, size: Number(f.size), mime: f.mime, addedBy: f.added_by, downloadCount: f.download_count, createdAt: f.created_at });
const toShare = (r: ShareRow, files: FileRow[]): Share => ({
  id: r.id, kind: r.kind, title: r.title, message: r.message, recipientEmail: r.recipient_email, hasPassword: !!r.password_hash,
  createdAt: r.created_at, createdByEmail: r.created_by_email, expiresAt: r.expires_at, revokedAt: r.revoked_at, purgedAt: r.purged_at,
  lastOpenedAt: r.last_opened_at, openCount: r.open_count, status: statusOf(r),
  files: files.filter((f) => f.share_id === r.id && f.status === "ready").map(toFile),
});

async function logEvent(r: { id: string; org_id: string }, type: ShareEvent["type"], fileName: string | null = null) {
  await db().from("file_share_events").insert({ share_id: r.id, org_id: r.org_id, type, file_name: fileName });
}

// ── Cleanup: files are deleted 7 days after the link was made (or when cancelled). ──
async function deleteStorage(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db().storage.from(SHARES_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

async function purgeShares(rows: { id: string }[]) {
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  const { data: files } = await db().from("file_share_files").select("storage_path").in("share_id", ids);
  await deleteStorage((files ?? []).map((f) => f.storage_path as string));
  await db().from("file_share_files").delete().in("share_id", ids);
  await db().from("file_shares").update({ purged_at: new Date().toISOString() }).in("id", ids);
  return ids.length;
}

export async function purgeExpired(orgId?: string) {
  let q = db().from("file_shares").select("id").is("purged_at", null).or(`expires_at.lte.${new Date().toISOString()},revoked_at.not.is.null`).limit(200);
  if (orgId) q = q.eq("org_id", orgId);
  const { data, error } = await q;
  if (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
  return purgeShares(data ?? []);
}

// ── Firm side ──────────────────────────────────────────────────────────────
export async function listShares(): Promise<Share[]> {
  const { orgId } = await requireUserOrg();
  await purgeExpired(orgId).catch(() => 0);
  const { data, error } = await db().from("file_shares").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200);
  if (error) throw isMissing(error) ? setupError() : error;
  const rows = (data ?? []) as ShareRow[];
  const { data: files } = rows.length
    ? await db().from("file_share_files").select("*").in("share_id", rows.map((r) => r.id))
    : { data: [] };
  return rows.map((r) => toShare(r, (files ?? []) as FileRow[]));
}

async function ownShare(id: string) {
  const { orgId, user } = await requireUserOrg();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ShareError(404, "This link wasn’t found.");
  const { data, error } = await db().from("file_shares").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (error) throw isMissing(error) ? setupError() : error;
  if (!data) throw new ShareError(404, "This link wasn’t found.");
  return { row: data as ShareRow, orgId, user };
}

export async function shareDetail(id: string) {
  const { row } = await ownShare(id);
  const [{ data: files }, { data: events }] = await Promise.all([
    db().from("file_share_files").select("*").eq("share_id", id),
    db().from("file_share_events").select("type, file_name, at").eq("share_id", id).order("at", { ascending: false }).limit(100),
  ]);
  return {
    share: toShare(row, (files ?? []) as FileRow[]),
    events: (events ?? []).map((e) => ({ type: e.type, fileName: e.file_name, at: e.at })) as ShareEvent[],
  };
}

export async function createShare(input: { kind?: unknown; title?: unknown; message?: unknown; recipientEmail?: unknown; password?: unknown }) {
  const { orgId, user } = await requireUserOrg();
  const kind: ShareKind = input.kind === "request" ? "request" : "send";
  const title = cleanText(input.title, 120) || (kind === "send" ? "Files for you" : "Please upload your documents");
  const email = cleanText(input.recipientEmail, 200);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ShareError(400, "That email address doesn’t look right.");
  const password = String(input.password ?? "");
  if (password && (password.length < 6 || password.length > 100)) throw new ShareError(400, "Use a password of at least 6 characters.");
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await db()
    .from("file_shares")
    .insert({
      org_id: orgId, kind, title, message: String(input.message ?? "").trim().slice(0, 2000), recipient_email: email || null,
      token_hash: sha256(token), password_hash: password ? hashPassword(password) : null,
      created_by: user.id, created_by_email: user.email, expires_at: new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw isMissing(error) ? setupError() : error;
  return { share: toShare(data as ShareRow, []), token };
}

// A fresh link (the old one stops working). Expiry doesn't change.
export async function newLink(id: string) {
  const { row } = await ownShare(id);
  if (statusOf(row) !== "active") throw new ShareError(410, "This link has ended. Create a new one.");
  const token = randomBytes(32).toString("base64url");
  await db().from("file_shares").update({ token_hash: sha256(token), failed_attempts: 0 }).eq("id", id);
  return { token };
}

// Cancel now: the link stops working and its files are deleted.
export async function cancelShare(id: string) {
  const { row } = await ownShare(id);
  await db().from("file_shares").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  await purgeShares([row]);
}

async function startUpload(row: ShareRow, addedBy: "firm" | "recipient", input: { name?: unknown; size?: unknown; type?: unknown }) {
  if (statusOf(row) !== "active") throw new ShareError(410, "This link has ended.");
  const size = Math.floor(Number(input.size) || 0);
  if (size <= 0) throw new ShareError(400, "That file is empty.");
  if (size > MAX_FILE_BYTES) throw new ShareError(413, "Each file can be up to 2 GB.");
  const max = row.kind === "send" ? MAX_FILES_SEND : MAX_FILES_REQUEST;
  const { count } = await db().from("file_share_files").select("*", { count: "exact", head: true }).eq("share_id", row.id);
  if ((count ?? 0) >= max) throw new ShareError(409, `A link can hold up to ${max} files.`);
  const id = crypto.randomUUID();
  const path = `${row.org_id}/${row.id}/${id}`;
  const mime = cleanText(input.type, 120) || "application/octet-stream";
  const { error } = await db().from("file_share_files").insert({
    id, share_id: row.id, org_id: row.org_id, name: cleanName(input.name), size, mime, storage_path: path, added_by: addedBy,
  });
  if (error) throw error;
  const { data, error: e2 } = await db().storage.from(SHARES_BUCKET).createSignedUploadUrl(path);
  if (e2 || !data) throw e2 ?? new Error("Could not prepare the upload");
  return { fileId: id, uploadUrl: data.signedUrl };
}

async function finishUpload(row: ShareRow, fileId: string) {
  const { data: f } = await db().from("file_share_files").select("*").eq("id", fileId).eq("share_id", row.id).maybeSingle();
  if (!f) throw new ShareError(404, "That file wasn’t found.");
  const file = f as FileRow;
  if (file.status === "ready") return toFile(file);
  // Make sure the upload really landed, and record its real size.
  const { data: info, error } = await db().storage.from(SHARES_BUCKET).info(file.storage_path);
  if (error || !info) throw new ShareError(409, "The upload didn’t finish. Please try again.");
  const realSize = Number((info as { size?: number }).size ?? file.size);
  const { data: done } = await db().from("file_share_files").update({ status: "ready", size: realSize }).eq("id", file.id).select("*").single();
  if (file.added_by === "recipient") await logEvent(row, "uploaded", file.name);
  return toFile(done as FileRow);
}

async function signedDownload(row: ShareRow, fileId: string, countIt: boolean) {
  const { data: f } = await db().from("file_share_files").select("*").eq("id", fileId).eq("share_id", row.id).eq("status", "ready").maybeSingle();
  if (!f) throw new ShareError(404, "That file wasn’t found.");
  const file = f as FileRow;
  const { data, error } = await db().storage.from(SHARES_BUCKET).createSignedUrl(file.storage_path, 60, { download: file.name });
  if (error || !data) throw new ShareError(404, "That file isn’t available anymore.");
  if (countIt) {
    await db().from("file_share_files").update({ download_count: file.download_count + 1 }).eq("id", file.id);
    await logEvent(row, "downloaded", file.name);
  }
  return { url: data.signedUrl };
}

export async function firmStartUpload(id: string, input: { name?: unknown; size?: unknown; type?: unknown }) {
  const { row } = await ownShare(id);
  if (row.kind !== "send") throw new ShareError(400, "Files on this link are uploaded by the person you sent it to.");
  return startUpload(row, "firm", input);
}
export async function firmFinishUpload(id: string, fileId: string) {
  const { row } = await ownShare(id);
  return finishUpload(row, fileId);
}
export async function firmDownload(id: string, fileId: string) {
  const { row } = await ownShare(id);
  return signedDownload(row, fileId, false);
}
export async function firmRemoveFile(id: string, fileId: string) {
  const { row } = await ownShare(id);
  const { data: f } = await db().from("file_share_files").select("storage_path").eq("id", fileId).eq("share_id", row.id).maybeSingle();
  if (!f) throw new ShareError(404, "That file wasn’t found.");
  await deleteStorage([f.storage_path as string]);
  await db().from("file_share_files").delete().eq("id", fileId);
}

// ── Public side (the person with the link) ─────────────────────────────────
async function byToken(token: string): Promise<ShareRow> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new ShareError(404, "This link isn’t valid.");
  const { data, error } = await db().from("file_shares").select("*").eq("token_hash", sha256(token)).maybeSingle();
  if (error) throw isMissing(error) ? new ShareError(404, "This link isn’t valid.") : error;
  if (!data) throw new ShareError(404, "This link isn’t valid. Ask the sender for a new one.");
  const row = data as ShareRow;
  const st = statusOf(row);
  if (st === "cancelled") throw new ShareError(410, "The sender cancelled this link.");
  if (st === "expired") throw new ShareError(410, "This link has expired and its files were deleted. Ask the sender for a new one.");
  return row;
}

async function unlock(row: ShareRow, password: unknown) {
  if (!row.password_hash) return;
  if (row.failed_attempts >= MAX_FAILED) throw new ShareError(429, "Too many wrong passwords. Ask the sender for a new link.", "locked");
  const pw = String(password ?? "");
  if (!pw) throw new ShareError(401, "Enter the password you were given.", "password_required");
  if (!checkPassword(pw, row.password_hash)) {
    await db().from("file_shares").update({ failed_attempts: row.failed_attempts + 1 }).eq("id", row.id);
    if (row.failed_attempts + 1 >= MAX_FAILED) await logEvent(row, "locked");
    throw new ShareError(401, "That password isn’t right.", "wrong_password");
  }
}

async function firmName(orgId: string) {
  const { data } = await db().from("organizations").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string | undefined) ?? "";
}

export async function publicAction(token: string, body: Record<string, unknown>) {
  const row = await byToken(token);
  const action = String(body.action ?? "view");
  const firm = await firmName(row.org_id);
  const base = { kind: row.kind, title: row.title, firm, expiresAt: row.expires_at, needsPassword: !!row.password_hash };

  if (action === "view" && row.password_hash && !body.password) return { ...base, locked: true };
  await unlock(row, body.password);

  if (action === "view") {
    // Count an "open" at most once an hour.
    if (!row.last_opened_at || Date.now() - new Date(row.last_opened_at).getTime() > 3_600_000) {
      await db().from("file_shares").update({ last_opened_at: new Date().toISOString(), open_count: row.open_count + 1, failed_attempts: 0 }).eq("id", row.id);
      await logEvent(row, "opened");
    }
    const { data: files } = await db().from("file_share_files").select("*").eq("share_id", row.id).eq("status", "ready").order("created_at");
    const list = ((files ?? []) as FileRow[]).filter((f) => (row.kind === "send" ? f.added_by === "firm" : f.added_by === "recipient"));
    return {
      ...base,
      locked: false,
      message: row.message,
      files: list.map((f) => ({ id: f.id, name: f.name, size: Number(f.size) })),
      maxFiles: row.kind === "send" ? MAX_FILES_SEND : MAX_FILES_REQUEST,
      maxBytes: MAX_FILE_BYTES,
    };
  }
  if (action === "download") {
    if (row.kind !== "send") throw new ShareError(403, "Files on this link can only be uploaded.");
    return signedDownload(row, String(body.fileId ?? ""), true);
  }
  if (action === "upload") {
    if (row.kind !== "request") throw new ShareError(403, "This link is for downloading files.");
    return startUpload(row, "recipient", body);
  }
  if (action === "complete") {
    if (row.kind !== "request") throw new ShareError(403, "This link is for downloading files.");
    const f = await finishUpload(row, String(body.fileId ?? ""));
    return { file: { id: f.id, name: f.name, size: f.size } };
  }
  throw new ShareError(400, "Unknown request.");
}

export function shareFail(where: string, e: unknown) {
  if (e instanceof ShareError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (isMissing(x)) return NextResponse.json({ error: setupError().message, code: "setup_required" }, { status: 503 });
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
