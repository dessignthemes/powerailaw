import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { FILE_TYPES, isFileType, nameWithExtension } from "@/lib/documents/fileTypes";
import { SendError } from "@/lib/mail/sendMail";

// Documents from a matter sent with an email: attached (the latest version of
// each), or — when they're too big for an email — put on the matter's secure
// client portal with a link in the message instead.

// Mailboxes refuse messages over about 25 MB once encoded; files are a third bigger encoded.
export const ATTACH_LIMIT_BYTES = 18 * 1024 * 1024;

const db = () => createAdminClient();

type DocRow = {
  id: string;
  title: string;
  matter_id: string | null;
  document_versions: { id: string; version_number: number; storage_path: string; size_bytes: number; file_type?: string | null }[];
};

async function matterDocs(orgId: string, matterId: string, ids: string[]) {
  const clean = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 25);
  if (!clean.length) return [];
  const { data, error } = await db()
    .from("documents")
    .select("id, title, matter_id, document_versions(id, version_number, storage_path, size_bytes, file_type)")
    .eq("org_id", orgId)
    .eq("matter_id", matterId)
    .in("id", clean);
  if (error) throw error;
  const rows = (data ?? []) as unknown as DocRow[];
  if (rows.length !== clean.length) throw new SendError("One of the documents wasn't found on this matter. Reload the page and pick it again.", 404);
  return rows.map((d) => {
    const v = [...d.document_versions].sort((a, b) => b.version_number - a.version_number)[0];
    if (!v) throw new SendError(`“${d.title}” has no file yet.`, 400);
    const type = isFileType(v.file_type) ? v.file_type : "pdf";
    return { id: d.id, title: d.title, path: v.storage_path, size: Number(v.size_bytes), name: nameWithExtension(d.title, type), mime: FILE_TYPES[type].mime };
  });
}

export async function attachmentsFor(orgId: string, matterId: string, ids: string[]) {
  const docs = await matterDocs(orgId, matterId, ids);
  const total = docs.reduce((n, d) => n + d.size, 0);
  if (total > ATTACH_LIMIT_BYTES) {
    throw new SendError(`These documents are ${Math.ceil(total / 1024 / 1024)} MB together, too big for one email. Send them as a secure portal link instead.`, 413, "too_large");
  }
  const out: { name: string; mime: string; bytes: Uint8Array }[] = [];
  for (const d of docs) {
    const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).download(d.path);
    if (error || !data) throw new SendError(`“${d.title}” couldn't be read. Please try again.`, 502);
    out.push({ name: d.name, mime: d.mime, bytes: new Uint8Array(await data.arrayBuffer()) });
  }
  return out;
}

// Puts the documents on the matter's client portal and returns the text to add
// to the email. The client (and anyone invited to the portal for this matter)
// signs in to download them.
export async function portalLinkFor(orgId: string, matterId: string, ids: string[], origin: string) {
  const docs = await matterDocs(orgId, matterId, ids);
  const { data: m } = await db().from("matters").select("client_id").eq("id", matterId).eq("org_id", orgId).maybeSingle();
  if (!(m as { client_id?: string | null } | null)?.client_id) {
    throw new SendError("Link this matter to a client first (Client, at the top of the matter): the portal shows documents to the matter's client.", 400);
  }
  const { error } = await db()
    .from("documents")
    .update({ portal_shared: true, portal_shared_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .in(
      "id",
      docs.map((d) => d.id)
    );
  if (error) throw new SendError("The documents couldn't be put on the client portal. Has the client portal been set up (migration 0024)?", 500);
  const url = `${origin}/portal/matters/${matterId}`;
  const list = docs.map((d) => `• ${d.name}`).join("\n");
  return `The ${docs.length === 1 ? "document is" : "documents are"} too large to attach, so ${docs.length === 1 ? "it is" : "they are"} on our secure client portal:\n${url}\n${list}\n(Sign in to the portal to view and download. If you don't have access yet, let us know and we'll send you an invitation.)`;
}
