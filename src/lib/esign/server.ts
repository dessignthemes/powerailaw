import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET, addVersionFromUpload, newStoragePath, requireDocumentAccess, AccessError } from "@/lib/data/documents";
import { firmTimezone } from "@/lib/ai/workspaceTools";
import { CONSENT_TEXT, FIELD_META, type FieldType, type SignField, type SignRequest } from "@/lib/esign/types";

export const ESIGN_MIGRATION = "0019_signature_requests.sql";

export class SignError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 410 | 503, message: string, public code?: string) {
    super(message);
  }
}

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST205" || e.code === "42P01" || /signature_requests/.test(e.message ?? ""));
const setup = () => new SignError(503, `Sending for signature needs a database update. Run supabase/migrations/${ESIGN_MIGRATION} in the Supabase SQL editor, then try again.`, "setup_required");

type Row = {
  id: string; org_id: string; document_id: string; version_id: string; matter_id: string; created_by: string | null; created_by_email: string | null;
  signer_name: string; signer_email: string; message: string; status: SignRequest["status"]; fields: SignField[]; field_values: Record<string, unknown>;
  decline_reason: string | null; signed_version_id: string | null; original_sha256: string | null; viewed_at: string | null; signed_at: string | null;
  expires_at: string; created_at: string;
};

const toRequest = (r: Row): SignRequest => ({
  id: r.id, documentId: r.document_id, versionId: r.version_id, signerName: r.signer_name, signerEmail: r.signer_email, message: r.message,
  status: r.status, expiresAt: r.expires_at, viewedAt: r.viewed_at, signedAt: r.signed_at, declineReason: r.decline_reason,
  signedVersionId: r.signed_version_id, createdAt: r.created_at, createdByEmail: r.created_by_email,
});

const TYPES: FieldType[] = ["signature", "initials", "date", "name", "text", "checkbox"];
function cleanFields(raw: unknown): SignField[] {
  if (!Array.isArray(raw)) throw new SignError(400, "Add at least one field for the client.");
  const n = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
  const fields = raw.slice(0, 80).map((f, i) => {
    const x = f as Partial<SignField>;
    const type = TYPES.includes(x.type as FieldType) ? (x.type as FieldType) : "text";
    return {
      id: String(x.id ?? `f${i}`).slice(0, 40), type, page: Math.max(1, Math.min(2000, Math.floor(Number(x.page) || 1))),
      x: n(x.x), y: n(x.y), w: Math.max(0.01, n(x.w)), h: Math.max(0.01, n(x.h)),
      label: String(x.label ?? FIELD_META[type].label).slice(0, 80), required: x.required !== false,
    };
  });
  if (!fields.some((f) => f.type === "signature")) throw new SignError(400, "Add at least one signature field.");
  return fields;
}

async function versionBytes(storagePath: string) {
  const { data, error } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) throw new SignError(404, "The document file couldn't be read.");
  return new Uint8Array(await data.arrayBuffer());
}

// ── Firm side ──────────────────────────────────────────────────────────────

export async function createRequest(input: { documentId: string; versionId?: string; signerName: string; signerEmail: string; message?: string; fields: unknown; expiresInDays?: number }) {
  const ctx = await requireDocumentAccess(input.documentId);
  const s = createAdminClient();
  const name = input.signerName?.trim().slice(0, 200);
  const email = input.signerEmail?.trim().toLowerCase().slice(0, 320);
  if (!name) throw new SignError(400, "Enter the signer's name.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SignError(400, "Enter the signer's email address.");
  const fields = cleanFields(input.fields);

  let q = s.from("document_versions").select("id, storage_path, version_number").eq("org_id", ctx.orgId).eq("document_id", input.documentId);
  q = input.versionId ? q.eq("id", input.versionId) : q.order("version_number", { ascending: false }).limit(1);
  const { data: versions } = await q;
  const v = versions?.[0];
  if (!v || !String(v.storage_path).endsWith(".pdf")) throw new SignError(400, "Only PDFs can be sent for signature. Convert the file to PDF first.");
  const original = await versionBytes(v.storage_path);

  const token = randomBytes(32).toString("base64url");
  const days = Math.max(1, Math.min(90, Math.floor(input.expiresInDays ?? 30)));
  const { data, error } = await s
    .from("signature_requests")
    .insert({
      org_id: ctx.orgId, document_id: input.documentId, version_id: v.id, matter_id: ctx.document.matter_id, created_by: ctx.user.id, created_by_email: ctx.user.email,
      signer_name: name, signer_email: email, message: (input.message ?? "").slice(0, 2000), token_hash: sha256(token), fields,
      original_sha256: sha256(original), expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if (missing(error)) throw setup();
    throw error;
  }
  return { request: toRequest(data as Row), token };
}

export async function listRequests() {
  const { orgId } = await requireOrgFromSession();
  const { data, error } = await createAdminClient().from("signature_requests").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1000);
  if (error) {
    if (missing(error)) return { requests: [] as SignRequest[], setupRequired: true };
    throw error;
  }
  return { requests: (data as Row[]).map(toRequest), setupRequired: false };
}

async function requireOrgFromSession() {
  const { getCurrentOrgId } = await import("@/lib/data/org");
  return { orgId: await getCurrentOrgId() };
}

export async function cancelRequest(id: string) {
  const { orgId } = await requireOrgFromSession();
  const { data, error } = await createAdminClient()
    .from("signature_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id)
    .in("status", ["sent", "viewed"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SignError(409, "This request can't be cancelled (it may already be signed).");
  return toRequest(data as Row);
}

// A new link for the same request (the old one stops working).
export async function renewLink(id: string) {
  const { orgId } = await requireOrgFromSession();
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await createAdminClient()
    .from("signature_requests")
    .update({ token_hash: sha256(token), expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id)
    .in("status", ["sent", "viewed"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SignError(409, "This request is finished, so its link can't be renewed.");
  return { request: toRequest(data as Row), token };
}

// ── Signer side (public, by link) ─────────────────────────────────────────

async function byToken(token: string): Promise<Row> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new SignError(404, "This signing link isn't valid.");
  const { data, error } = await createAdminClient().from("signature_requests").select("*").eq("token_hash", sha256(token)).maybeSingle();
  if (error) {
    if (missing(error)) throw new SignError(404, "This signing link isn't valid.");
    throw error;
  }
  if (!data) throw new SignError(404, "This signing link isn't valid or has been replaced by a newer one.");
  return data as Row;
}

export async function publicView(token: string) {
  const r = await byToken(token);
  const s = createAdminClient();
  const [{ data: doc }, { data: org }, { data: ver }] = await Promise.all([
    s.from("documents").select("title").eq("id", r.document_id).maybeSingle(),
    s.from("organizations").select("name").eq("id", r.org_id).maybeSingle(),
    s.from("document_versions").select("storage_path").eq("id", r.version_id).maybeSingle(),
  ]);
  const expired = new Date(r.expires_at).getTime() < Date.now();
  let pdfUrl: string | null = null;
  let signedUrl: string | null = null;
  if ((r.status === "sent" || r.status === "viewed") && !expired && ver) {
    const { data } = await s.storage.from(DOCUMENTS_BUCKET).createSignedUrl(ver.storage_path, 3600);
    pdfUrl = data?.signedUrl ?? null;
    if (r.status === "sent") await s.from("signature_requests").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", r.id);
  }
  if (r.status === "signed" && r.signed_version_id) {
    const { data: sv } = await s.from("document_versions").select("storage_path").eq("id", r.signed_version_id).maybeSingle();
    if (sv) signedUrl = (await s.storage.from(DOCUMENTS_BUCKET).createSignedUrl(sv.storage_path, 3600, { download: `${(doc?.title ?? "document").replace(/\.pdf$/i, "")} (signed).pdf` })).data?.signedUrl ?? null;
  }
  const firm = (org?.name as string | undefined)?.includes("@") ? "" : (org?.name as string | undefined) ?? "";
  return {
    status: expired && r.status !== "signed" ? "expired" : r.status,
    documentTitle: (doc?.title as string | undefined) ?? "Document",
    firm,
    senderEmail: r.created_by_email,
    signerName: r.signer_name,
    signerEmail: r.signer_email,
    message: r.message,
    fields: r.fields,
    pdfUrl,
    signedUrl,
    consentText: CONSENT_TEXT,
  };
}

async function loadFont(pdf: PDFDocument): Promise<PDFFont> {
  pdf.registerFontkit(fontkit);
  try {
    const ttf = await readFile(path.join(process.cwd(), "public", "pdfjs", "standard_fonts", "LiberationSans-Regular.ttf"));
    return await pdf.embedFont(ttf, { subset: true });
  } catch {
    const { StandardFonts } = await import("pdf-lib");
    return pdf.embedFont(StandardFonts.Helvetica);
  }
}

function dataUrlPng(v: unknown): Uint8Array | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length > 400_000) return null;
  return Uint8Array.from(Buffer.from(m[1], "base64"));
}

export async function submitSignature(token: string, body: { values?: Record<string, unknown>; consent?: boolean }, meta: { ip: string; userAgent: string }) {
  const r = await byToken(token);
  if (r.status === "signed") throw new SignError(409, "This document has already been signed.");
  if (r.status === "declined" || r.status === "cancelled") throw new SignError(410, "This signing request is no longer active.");
  if (new Date(r.expires_at).getTime() < Date.now()) throw new SignError(410, "This signing link has expired. Ask the sender for a new one.");
  if (body.consent !== true) throw new SignError(400, "Please agree to sign electronically.");
  const values = body.values ?? {};
  for (const f of r.fields) {
    const v = values[f.id];
    const empty = f.type === "checkbox" ? v !== true && f.required : f.type === "signature" || f.type === "initials" ? !dataUrlPng(v) : f.type === "date" ? false : !(typeof v === "string" && v.trim());
    if (f.required && empty) throw new SignError(400, `Please complete "${f.label}".`);
  }

  const s = createAdminClient();
  const { data: ver } = await s.from("document_versions").select("storage_path").eq("id", r.version_id).maybeSingle();
  if (!ver) throw new SignError(404, "The document is no longer available.");
  const original = await versionBytes(ver.storage_path);
  if (r.original_sha256 && sha256(original) !== r.original_sha256) throw new SignError(409, "The document changed after it was sent. Ask the sender for a new link.");

  const tz = await firmTimezone(r.org_id);
  const now = new Date();
  const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "2-digit", day: "2-digit", year: "numeric" }).format(now);

  const docTitle = ((await s.from("documents").select("title").eq("id", r.document_id).maybeSingle()).data?.title as string | undefined) ?? "";
  const signed = await stampPdf(original, {
    fields: r.fields, values, tz, now, docTitle, requestId: r.id, originalSha: r.original_sha256 ?? sha256(original),
    signerName: r.signer_name, signerEmail: r.signer_email, ip: meta.ip, userAgent: meta.userAgent,
    sentAt: r.created_at, sentBy: r.created_by_email, viewedAt: r.viewed_at,
  });
  const storagePath = newStoragePath(r.org_id, r.matter_id, "pdf");
  const up = await s.storage.from(DOCUMENTS_BUCKET).upload(storagePath, signed, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new SignError(503, "The signed copy couldn't be saved. Please try again.");
  const doc = await addVersionFromUpload({
    orgId: r.org_id, matterId: r.matter_id, documentId: r.document_id,
    userId: r.created_by as string, userEmail: r.signer_email, path: storagePath, basedOnVersionId: r.version_id,
    note: `Signed by ${r.signer_name} (${r.signer_email}) via LawPower e-signature`,
  });
  const keep: Record<string, unknown> = {};
  for (const f of r.fields) keep[f.id] = f.type === "signature" || f.type === "initials" ? "captured" : f.type === "date" ? fmtDate : values[f.id] ?? null;
  await s.from("signature_requests").update({
    status: "signed", signed_at: now.toISOString(), signed_version_id: doc.versions[0]?.id ?? null, field_values: keep,
    signer_ip: meta.ip.slice(0, 100), signer_user_agent: meta.userAgent.slice(0, 500), updated_at: now.toISOString(),
  }).eq("id", r.id);
  return { ok: true };
}

export async function declineSignature(token: string, reason: string) {
  const r = await byToken(token);
  if (r.status !== "sent" && r.status !== "viewed") throw new SignError(409, "This request is no longer active.");
  await createAdminClient().from("signature_requests").update({ status: "declined", decline_reason: reason.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", r.id);
  return { ok: true };
}

export type StampInput = {
  fields: SignField[]; values: Record<string, unknown>; tz: string; now: Date; docTitle: string; requestId: string; originalSha: string;
  signerName: string; signerEmail: string; ip: string; userAgent: string; sentAt: string; sentBy: string | null; viewedAt: string | null;
};

// Draws the signer's entries onto the PDF and adds a signature certificate page.
export async function stampPdf(original: Uint8Array, o: StampInput): Promise<Uint8Array> {
  const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: o.tz, month: "2-digit", day: "2-digit", year: "numeric" }).format(o.now);
  const fmtFull = (d: Date) => `${new Intl.DateTimeFormat("en-US", { timeZone: o.tz, dateStyle: "medium", timeStyle: "long" }).format(d)} (${d.toISOString()})`;
  const pdf = await PDFDocument.load(original, { ignoreEncryption: false });
  const font = await loadFont(pdf);
  const pages = pdf.getPages();
  const ink = rgb(0.05, 0.1, 0.35);
  for (const f of o.fields) {
    const page = pages[f.page - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const bx = f.x * W, bw = f.w * W, bh = f.h * H, by = H - (f.y + f.h) * H;
    const v = o.values[f.id];
    if (f.type === "signature" || f.type === "initials") {
      const png = dataUrlPng(v);
      if (!png) continue;
      const img = await pdf.embedPng(png);
      const sc = Math.min(bw / img.width, bh / img.height);
      page.drawImage(img, { x: bx, y: by + (bh - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
    } else if (f.type === "checkbox") {
      if (v === true) page.drawText("X", { x: bx + bw * 0.15, y: by + bh * 0.15, size: Math.min(bh, bw) * 0.9, font, color: ink });
    } else {
      const text = (f.type === "date" ? fmtDate : f.type === "name" && !(typeof v === "string" && v.trim()) ? o.signerName : String(v ?? "")).replace(/\s+/g, " ").slice(0, 200);
      if (!text) continue;
      let size = Math.min(bh * 0.75, 12);
      while (size > 5 && font.widthOfTextAtSize(text, size) > bw) size -= 0.5;
      page.drawText(text, { x: bx + 1, y: by + (bh - size) / 2 + size * 0.2, size, font, color: ink });
    }
  }

  // Audit certificate page.
  const cert = pdf.addPage([612, 792]);
  let y = 740;
  const line = (t: string, size = 10, gap = 16, color = rgb(0.1, 0.1, 0.1)) => {
    for (const chunk of wrap(t, font, size, 512)) {
      cert.drawText(chunk, { x: 50, y, size, font, color });
      y -= gap;
    }
  };
  line("Signature Certificate", 18, 30);
  line(`Document: ${o.docTitle}`);
  line(`Request ID: ${o.requestId}`);
  line(`Original document SHA-256: ${o.originalSha}`, 9);
  y -= 8;
  line("Signer", 12, 20);
  line(`Name: ${o.signerName}`);
  line(`Email: ${o.signerEmail}`);
  line(`IP address: ${o.ip || "unknown"}`);
  line(`Browser: ${o.userAgent.slice(0, 180) || "unknown"}`, 9);
  y -= 8;
  line("Events", 12, 20);
  line(`Sent: ${fmtFull(new Date(o.sentAt))}${o.sentBy ? ` by ${o.sentBy}` : ""}`);
  if (o.viewedAt) line(`Viewed: ${fmtFull(new Date(o.viewedAt))}`);
  line(`Signed: ${fmtFull(o.now)}`);
  y -= 8;
  line("Consent", 12, 20);
  line(`The signer agreed: "${CONSENT_TEXT}"`);
  y -= 8;
  line("Signed electronically through LawPower AI (lawpower.ai).", 9, 14, rgb(0.4, 0.4, 0.45));
  pdf.setModificationDate(o.now);

  return pdf.save();
}

function wrap(text: string, font: PDFFont, size: number, max: number) {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export { AccessError };
