import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dropboxSession, download, DropboxError } from "@/lib/dropbox/client";
import { requireUser, cleanPath, dropboxErrorResponse } from "@/lib/dropbox/api";
import {
  DOCUMENTS_BUCKET,
  createDocumentFromUpload,
  newStoragePath,
  requireFileTypes,
  requireMatterAccess,
} from "@/lib/data/documents";
import { FILE_TYPES, MAX_DOCUMENT_BYTES, fileProblemMessages, fileTypeFromName } from "@/lib/documents/fileTypes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { path, matterId } — copies a Dropbox file into a matter's documents.
// The file in Dropbox is left exactly as it is.
export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json().catch(() => ({}))) as { path?: string; matterId?: string };
    if (!body.matterId) throw new DropboxError("not_found", "Choose the matter to save this file to.", 400);
    const ctx = await requireMatterAccess(body.matterId);
    const path = cleanPath(body.path, false);

    const name = path.split("/").pop() ?? "file";
    const type = fileTypeFromName(name);
    if (!type) return NextResponse.json({ error: fileProblemMessages.unsupported, code: "unsupported" }, { status: 422 });
    if (type !== "pdf") await requireFileTypes();

    const s = await dropboxSession(ctx.user.id);
    const file = await download(s, path, MAX_DOCUMENT_BYTES);

    const storagePath = newStoragePath(ctx.orgId, ctx.matter.id, type);
    const { error } = await createAdminClient()
      .storage.from(DOCUMENTS_BUCKET)
      .upload(storagePath, file.bytes, { contentType: FILE_TYPES[type].mime, upsert: false });
    if (error) {
      console.error("Dropbox import upload failed:", error);
      throw new DropboxError("provider_error", "The file couldn't be saved. Please try again.", 502);
    }

    // Validates the bytes (and removes the file if it isn't what its name says).
    const document = await createDocumentFromUpload({
      orgId: ctx.orgId,
      matterId: ctx.matter.id,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      title: file.name,
      path: storagePath,
      note: `Imported from Dropbox (${path})`,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return dropboxErrorResponse("POST /api/dropbox/import", error);
  }
}
