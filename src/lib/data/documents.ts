import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { checkPdf, pdfProblemMessages, type PdfProblem } from "@/lib/pdfValidation";

export const DOCUMENTS_BUCKET = "matter-documents";

export type DocumentVersion = {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  pageCount: number;
  hasFormFields: boolean;
  note: string;
  createdByEmail: string | null;
  createdAt: string;
};

export type MatterDocument = {
  id: string;
  matterId: string;
  matterTitle: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  versions: DocumentVersion[]; // newest first
};

export class AccessError extends Error {
  constructor(public status: 401 | 403 | 404, message: string) {
    super(message);
  }
}

export class PdfRejectedError extends Error {
  constructor(public problem: PdfProblem) {
    super(pdfProblemMessages[problem]);
  }
}

type VersionRow = {
  id: string;
  version_number: number;
  size_bytes: number;
  page_count: number;
  has_form_fields: boolean;
  note: string;
  created_by_email: string | null;
  created_at: string;
};

function toVersion(v: VersionRow): DocumentVersion {
  return {
    id: v.id,
    versionNumber: v.version_number,
    sizeBytes: Number(v.size_bytes),
    pageCount: v.page_count,
    hasFormFields: v.has_form_fields,
    note: v.note,
    createdByEmail: v.created_by_email,
    createdAt: v.created_at,
  };
}

// ── Access ────────────────────────────────────────────────────────────────
// The app's permission model today: a signed-in user can see the matters
// that belong to their organization (profiles.org_id). Every document
// operation goes through one of these checks before touching data or files.

export async function requireUserOrg() {
  const user = await getSessionUser();
  if (!user) throw new AccessError(401, "Please sign in again.");

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!profile) throw new AccessError(403, "Your account isn't linked to a firm yet.");

  return { user, orgId: profile.org_id as string };
}

export async function requireMatterAccess(matterId: string) {
  const ctx = await requireUserOrg();
  const supabase = createAdminClient();
  const { data: matter } = await supabase
    .from("matters")
    .select("id, title")
    .eq("id", matterId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!matter) throw new AccessError(404, "Matter not found, or you don't have access to it.");
  return { ...ctx, matter: matter as { id: string; title: string } };
}

export async function requireDocumentAccess(documentId: string) {
  const ctx = await requireUserOrg();
  const supabase = createAdminClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, matter_id, title")
    .eq("id", documentId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!doc) throw new AccessError(404, "Document not found, or you don't have access to it.");
  return { ...ctx, document: doc as { id: string; matter_id: string; title: string } };
}

// ── Storage paths ─────────────────────────────────────────────────────────
// {org}/{matter}/{random}.pdf — the prefix is re-checked when a client
// hands a path back, so nobody can attach a file from another matter.

export function newStoragePath(orgId: string, matterId: string) {
  return `${orgId}/${matterId}/${crypto.randomUUID()}.pdf`;
}

function assertPathBelongs(path: string, orgId: string, matterId: string) {
  const prefix = `${orgId}/${matterId}/`;
  if (!path.startsWith(prefix) || path.includes("..") || !/^[0-9a-f/-]+\.pdf$/i.test(path)) {
    throw new AccessError(403, "That upload doesn't belong to this matter.");
  }
}

export async function createUploadUrl(path: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Could not create upload URL");
  return { path: data.path, token: data.token };
}

// Download what the browser uploaded, validate it, and delete it if it's bad.
async function validateUploaded(path: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new PdfRejectedError("damaged");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const check = await checkPdf(bytes);
  if (!check.ok) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    throw new PdfRejectedError(check.problem);
  }
  return { ...check, sizeBytes: bytes.byteLength };
}

// ── Queries ───────────────────────────────────────────────────────────────

type DocRow = {
  id: string;
  matter_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  matters: { title: string } | null;
  document_versions: VersionRow[];
};

function toDocument(row: DocRow): MatterDocument {
  return {
    id: row.id,
    matterId: row.matter_id,
    matterTitle: row.matters?.title ?? null,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versions: [...(row.document_versions ?? [])]
      .sort((a, b) => b.version_number - a.version_number)
      .map(toVersion),
  };
}

const DOC_SELECT =
  "id, matter_id, title, created_at, updated_at, matters(title), document_versions(id, version_number, size_bytes, page_count, has_form_fields, note, created_by_email, created_at)";

export async function listDocuments(orgId: string, matterId?: string): Promise<MatterDocument[]> {
  const supabase = createAdminClient();
  let q = supabase.from("documents").select(DOC_SELECT).eq("org_id", orgId);
  if (matterId) q = q.eq("matter_id", matterId);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as DocRow[]).map(toDocument);
}

export async function getDocument(orgId: string, documentId: string): Promise<MatterDocument> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("org_id", orgId)
    .eq("id", documentId)
    .single();
  if (error) throw error;
  return toDocument(data as unknown as DocRow);
}

// ── Mutations ─────────────────────────────────────────────────────────────

export async function createDocumentFromUpload(opts: {
  orgId: string;
  matterId: string;
  userId: string;
  userEmail: string | null;
  title: string;
  path: string;
}): Promise<MatterDocument> {
  assertPathBelongs(opts.path, opts.orgId, opts.matterId);
  const check = await validateUploaded(opts.path);
  const supabase = createAdminClient();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      org_id: opts.orgId,
      matter_id: opts.matterId,
      title: opts.title.trim().slice(0, 200) || "Untitled.pdf",
      created_by: opts.userId,
    })
    .select("id")
    .single();
  if (docError) throw docError;

  const { error: vError } = await supabase.from("document_versions").insert({
    org_id: opts.orgId,
    document_id: doc.id,
    version_number: 1,
    storage_path: opts.path,
    size_bytes: check.sizeBytes,
    page_count: check.pageCount,
    has_form_fields: check.hasFormFields,
    note: "Original upload",
    created_by: opts.userId,
    created_by_email: opts.userEmail,
  });
  if (vError) {
    await supabase.from("documents").delete().eq("id", doc.id);
    throw vError;
  }

  return getDocument(opts.orgId, doc.id);
}

export async function addVersionFromUpload(opts: {
  orgId: string;
  matterId: string;
  documentId: string;
  userId: string;
  userEmail: string | null;
  path: string;
  basedOnVersionId: string | null;
  note: string;
}): Promise<MatterDocument> {
  assertPathBelongs(opts.path, opts.orgId, opts.matterId);
  const check = await validateUploaded(opts.path);
  const supabase = createAdminClient();

  // Next version number; the unique (document_id, version_number) constraint
  // catches two people saving at the same instant, so retry a couple of times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest } = await supabase
      .from("document_versions")
      .select("version_number")
      .eq("document_id", opts.documentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (latest?.version_number ?? 0) + 1;

    const { error } = await supabase.from("document_versions").insert({
      org_id: opts.orgId,
      document_id: opts.documentId,
      version_number: next,
      storage_path: opts.path,
      size_bytes: check.sizeBytes,
      page_count: check.pageCount,
      has_form_fields: check.hasFormFields,
      note: opts.note.trim().slice(0, 500),
      based_on_version_id: opts.basedOnVersionId,
      created_by: opts.userId,
      created_by_email: opts.userEmail,
    });
    if (!error) {
      await supabase
        .from("documents")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", opts.documentId);
      return getDocument(opts.orgId, opts.documentId);
    }
    if (error.code !== "23505") throw error; // not a unique-violation → real error
  }
  throw new Error("Could not allocate a version number, please try again.");
}

export async function signedDownloadUrl(orgId: string, versionId: string) {
  const supabase = createAdminClient();
  const { data: v } = await supabase
    .from("document_versions")
    .select("storage_path")
    .eq("id", versionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!v) throw new AccessError(404, "Version not found, or you don't have access to it.");
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(v.storage_path, 120);
  if (error || !data) throw error ?? new Error("Could not create download URL");
  return data.signedUrl;
}
