import "server-only";
import { PDFDocument, EncryptedPDFError } from "pdf-lib";
import { hasPdfHeader, looksEncrypted, PASSWORD_PDF_MESSAGE } from "@/lib/pdf/sniff";

export const MAX_PDF_BYTES = 100 * 1024 * 1024;

export type PdfProblem = "empty" | "too_large" | "not_pdf" | "encrypted" | "damaged";

export const pdfProblemMessages: Record<PdfProblem, string> = {
  empty: "That file is empty.",
  too_large: "PDFs must be 100 MB or smaller.",
  not_pdf: "This file isn't a PDF. Please upload a .pdf file.",
  encrypted: PASSWORD_PDF_MESSAGE,
  damaged:
    "This PDF appears to be damaged and can't be read. Try re-exporting or re-saving it from the original app, then upload it again.",
};

export type PdfCheck =
  | { ok: true; pageCount: number; hasFormFields: boolean; locked?: boolean }
  | { ok: false; problem: PdfProblem };

// Server-side check run on every upload and every saved version, so a bad
// file never becomes a document version.
export async function checkPdf(bytes: Uint8Array): Promise<PdfCheck> {
  if (bytes.byteLength === 0) return { ok: false, problem: "empty" };
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, problem: "too_large" };

  // "%PDF-" must appear near the start (some generators prepend a few bytes).
  if (!hasPdfHeader(bytes)) return { ok: false, problem: "not_pdf" };
  // Check encryption before parsing: pdf-lib can fail on encrypted object
  // streams before it gets far enough to say the file is encrypted.
  // Encrypted PDFs: pdf-lib can't read them, so ask pdf.js. If it opens with no
  // password the file only has editing restrictions (DocuSign does this):
  // accept it, view only.
  if (looksEncrypted(bytes)) return checkLockedPdf(bytes);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err instanceof EncryptedPDFError) return { ok: false, problem: "encrypted" };
    return { ok: false, problem: "damaged" };
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) return { ok: false, problem: "damaged" };

  let hasFormFields = false;
  try {
    hasFormFields = doc.getForm().getFields().length > 0;
  } catch {
    // A malformed AcroForm shouldn't block the document; forms just won't be offered.
  }

  return { ok: true, pageCount, hasFormFields };
}

async function checkLockedPdf(bytes: Uint8Array): Promise<PdfCheck> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, stopAtErrors: false });
  task.onPassword = () => {
    void task.destroy();
  };
  try {
    const doc = await task.promise;
    const pageCount = doc.numPages;
    return pageCount > 0 ? { ok: true, pageCount, hasFormFields: false, locked: true } : { ok: false, problem: "damaged" };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException" || task.destroyed) return { ok: false, problem: "encrypted" };
    return { ok: false, problem: "damaged" };
  } finally {
    void task.destroy();
  }
}
