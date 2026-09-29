"use client";

import { PDFDocument, EncryptedPDFError } from "pdf-lib";
import { createClient } from "@/lib/supabase/client";
import { openPdf, openProblemMessages } from "@/lib/pdf/pdfjsClient";
import { hasPdfHeader, looksEncrypted } from "@/lib/pdf/sniff";
import { FILE_TYPES, checkFileBytes, fileProblemMessages, fileTypeFromName, MAX_DOCUMENT_BYTES } from "@/lib/documents/fileTypes";

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

async function uploadBytes(
  bytes: Uint8Array,
  target: { matterId?: string; documentId?: string },
  fileName: string,
  contentType = "application/pdf"
) {
  const { path, token } = await fetch("/api/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, fileName, size: bytes.byteLength }),
  }).then(readJson);

  const supabase = createClient();
  const blob = new Blob([bytes as BlobPart], { type: contentType });
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, blob, { contentType });
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

export async function versionDownloadUrl(versionId: string, asDownload = false): Promise<string> {
  const { url } = await fetch(`/api/documents/versions/${versionId}${asDownload ? "?download=1" : ""}`).then(readJson);
  return url;
}

// ── Any file type (Documents section) ─────────────────────────────────────

async function precheckAny(file: File) {
  const type = fileTypeFromName(file.name);
  if (!type) throw new UploadError(fileProblemMessages.unsupported);
  if (type === "pdf") return { type, bytes: await precheckPdf(file, file.name) };
  if (file.size === 0) throw new UploadError(fileProblemMessages.empty);
  if (file.size > MAX_DOCUMENT_BYTES) throw new UploadError(fileProblemMessages.too_large);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFileBytes(type, bytes);
  if (!check.ok) throw new UploadError(fileProblemMessages[check.problem]);
  return { type, bytes };
}

export async function uploadAnyDocument(matterId: string, file: File) {
  const { type, bytes } = await precheckAny(file);
  const path = await uploadBytes(bytes, { matterId }, file.name, FILE_TYPES[type].mime);
  const { document } = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matterId, title: file.name, path }),
  }).then(readJson);
  return document;
}

// A replacement file becomes the next version; earlier versions are kept.
export async function uploadFileAsVersion(documentId: string, file: File, basedOnVersionId: string | null) {
  const { type, bytes } = await precheckAny(file);
  const path = await uploadBytes(bytes, { documentId }, file.name, FILE_TYPES[type].mime);
  const { document } = await fetch(`/api/documents/${documentId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, basedOnVersionId, note: `Uploaded ${file.name}` }),
  }).then(readJson);
  return document;
}

async function loadFonts() {
  const get = async (n: string) => {
    const res = await fetch(`/pdfjs/standard_fonts/LiberationSans-${n}.ttf`);
    if (!res.ok) throw new UploadError("Couldn't load the fonts needed to convert. Please try again.");
    return res.arrayBuffer();
  };
  const [regular, bold, italic, boldItalic] = await Promise.all([get("Regular"), get("Bold"), get("Italic"), get("BoldItalic")]);
  return { regular, bold, italic, boldItalic };
}

// Converts a Word (.docx) version to PDF in the browser and saves the PDF as
// the document's next version. The Word version stays in the history.
export async function convertWordVersionToPdf(documentId: string, title: string, version: { id: string; versionNumber: number }) {
  const { docxToPdf, ConvertError } = await import("@/lib/pdf/docxToPdf");
  const [bytes, fonts] = await Promise.all([fetchVersionBytes(version.id), loadFonts()]);
  let pdf: Uint8Array;
  let skippedImages = 0;
  try {
    const res = await docxToPdf(bytes.slice().buffer, fonts, title);
    pdf = res.pdf;
    skippedImages = res.skippedImages;
  } catch (e) {
    if (e instanceof ConvertError) throw new UploadError(e.message);
    throw new UploadError("This Word file couldn't be converted. Open it in Word, use Save as PDF and upload that PDF instead.");
  }
  if (pdf.byteLength > MAX_PDF_BYTES) throw new UploadError("The converted PDF is larger than 25 MB, so it can't be saved.");
  const document = await uploadNewVersion(documentId, pdf, version.id, `Converted to PDF from version ${version.versionNumber} (Word)`);
  return { document, skippedImages };
}
