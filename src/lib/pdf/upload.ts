"use client";

import { PDFDocument, EncryptedPDFError } from "pdf-lib";
import { createClient } from "@/lib/supabase/client";
import { openPdf, openProblemMessages } from "@/lib/pdf/pdfjsClient";
import { hasPdfHeader, looksEncrypted } from "@/lib/pdf/sniff";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const BUCKET = "matter-documents";

export class UploadError extends Error {}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadError(data?.error ?? `Request failed (${res.status})`);
  return data;
}

// Quick checks in the browser so people get a clear message before
// anything is uploaded. The server re-validates every file regardless.
export async function precheckPdf(file: File | Blob, name?: string): Promise<Uint8Array> {
  if (name && !/\.pdf$/i.test(name)) throw new UploadError("This file isn't a PDF. Please upload a .pdf file.");
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_PDF_BYTES) throw new UploadError("PDFs must be 25 MB or smaller.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfHeader(bytes)) throw new UploadError("This file isn't a PDF. Please upload a .pdf file.");
  if (looksEncrypted(bytes)) throw new UploadError(openProblemMessages.encrypted);

  const opened = await openPdf(bytes);
  if ("problem" in opened) throw new UploadError(openProblemMessages[opened.problem]);
  await opened.close();

  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err instanceof EncryptedPDFError) throw new UploadError(openProblemMessages.encrypted);
    throw new UploadError(openProblemMessages.damaged);
  }
  return bytes;
}

async function uploadBytes(bytes: Uint8Array, target: { matterId?: string; documentId?: string }, fileName: string) {
  const { path, token } = await fetch("/api/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, fileName, size: bytes.byteLength }),
  }).then(readJson);

  const supabase = createClient();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, blob, { contentType: "application/pdf" });
  if (error) throw new UploadError("The upload didn't finish. Check your connection and try again.");
  return path as string;
}

export async function uploadNewDocument(matterId: string, file: File) {
  const bytes = await precheckPdf(file, file.name);
  const path = await uploadBytes(bytes, { matterId }, file.name);
  const { document } = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matterId, title: file.name, path }),
  }).then(readJson);
  return document;
}

export async function uploadNewVersion(documentId: string, bytes: Uint8Array, basedOnVersionId: string, note: string) {
  const path = await uploadBytes(bytes, { documentId }, "edited.pdf");
  const { document } = await fetch(`/api/documents/${documentId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, basedOnVersionId, note }),
  }).then(readJson);
  return document;
}

export async function fetchVersionBytes(versionId: string): Promise<Uint8Array> {
  const { url } = await fetch(`/api/documents/versions/${versionId}`).then(readJson);
  const res = await fetch(url);
  if (!res.ok) throw new UploadError("Couldn't download this PDF. Please try again.");
  return new Uint8Array(await res.arrayBuffer());
}

export async function versionDownloadUrl(versionId: string): Promise<string> {
  const { url } = await fetch(`/api/documents/versions/${versionId}`).then(readJson);
  return url;
}
