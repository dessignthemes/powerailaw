// File types the Documents section accepts. Shared by the browser pre-check
// and the server validation, so both agree on what's allowed.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type FileType =
  | "pdf"
  | "doc"
  | "docx"
  | "rtf"
  | "odt"
  | "txt"
  | "xls"
  | "xlsx"
  | "csv"
  | "ppt"
  | "pptx"
  | "png"
  | "jpg"
  | "eml"
  | "msg";

type Info = { label: string; mime: string; exts: string[] };

export const FILE_TYPES: Record<FileType, Info> = {
  pdf: { label: "PDF", mime: "application/pdf", exts: ["pdf"] },
  doc: { label: "Word", mime: "application/msword", exts: ["doc"] },
  docx: {
    label: "Word",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    exts: ["docx"],
  },
  rtf: { label: "Rich text", mime: "application/rtf", exts: ["rtf"] },
  odt: { label: "OpenDocument", mime: "application/vnd.oasis.opendocument.text", exts: ["odt"] },
  txt: { label: "Text", mime: "text/plain", exts: ["txt"] },
  xls: { label: "Excel", mime: "application/vnd.ms-excel", exts: ["xls"] },
  xlsx: { label: "Excel", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", exts: ["xlsx"] },
  csv: { label: "CSV", mime: "text/csv", exts: ["csv"] },
  ppt: { label: "PowerPoint", mime: "application/vnd.ms-powerpoint", exts: ["ppt"] },
  pptx: {
    label: "PowerPoint",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    exts: ["pptx"],
  },
  png: { label: "Image", mime: "image/png", exts: ["png"] },
  jpg: { label: "Image", mime: "image/jpeg", exts: ["jpg", "jpeg"] },
  eml: { label: "Email", mime: "message/rfc822", exts: ["eml"] },
  msg: { label: "Outlook email", mime: "application/vnd.ms-outlook", exts: ["msg"] },
};

export const ACCEPT_ATTR = Object.values(FILE_TYPES)
  .flatMap((t) => t.exts.map((e) => `.${e}`))
  .join(",");

export const ACCEPTED_SUMMARY = "PDF, Word, Excel, PowerPoint, text, images and emails, up to 25 MB";

export function fileTypeFromName(name: string): FileType | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  for (const [type, info] of Object.entries(FILE_TYPES) as [FileType, Info][]) {
    if (info.exts.includes(ext)) return type;
  }
  return null;
}

export function isFileType(v: unknown): v is FileType {
  return typeof v === "string" && v in FILE_TYPES;
}

export function fileTypeLabel(t: FileType | string | null | undefined) {
  return (t && isFileType(t) && FILE_TYPES[t].label) || "File";
}

// Give a title the extension of the file type (for download names).
export function nameWithExtension(title: string, type: FileType) {
  const ext = FILE_TYPES[type].exts[0];
  const base = title.replace(/\.[a-z0-9]{2,5}$/i, "");
  return `${base || "document"}.${ext}`;
}

export type FileProblem = "empty" | "too_large" | "unsupported" | "mismatch" | "protected";

export const fileProblemMessages: Record<FileProblem, string> = {
  empty: "That file is empty.",
  too_large: "Files must be 25 MB or smaller.",
  unsupported: `This file type isn't supported. You can add ${ACCEPTED_SUMMARY}.`,
  mismatch: "This file's contents don't match its name. Save it again from the app that created it and upload that copy.",
  protected:
    "This Word file is password-protected, so it can't be read. Remove the password in Word, save a copy and upload that copy.",
};

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function latin1(bytes: Uint8Array, start: number, end: number) {
  return new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, start), Math.min(bytes.length, end)));
}

// Zip central directory lists file names; it sits at the end of the file.
function zipHas(bytes: Uint8Array, name: string) {
  return latin1(bytes, bytes.length - 256 * 1024, bytes.length).includes(name) || latin1(bytes, 0, 64 * 1024).includes(name);
}

function looksLikeText(bytes: Uint8Array) {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

// Checks a non-PDF file's bytes match its type (PDFs have their own, deeper check).
export function checkFileBytes(type: FileType, bytes: Uint8Array): { ok: true } | { ok: false; problem: FileProblem } {
  if (bytes.byteLength === 0) return { ok: false, problem: "empty" };
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return { ok: false, problem: "too_large" };
  const fail = { ok: false as const, problem: "mismatch" as const };
  switch (type) {
    case "pdf":
      return latin1(bytes, 0, 1024).includes("%PDF-") ? { ok: true } : fail;
    case "docx":
      // A password-protected .docx is stored as an OLE container instead of a zip.
      if (startsWith(bytes, OLE)) return { ok: false, problem: "protected" };
      return startsWith(bytes, ZIP) && zipHas(bytes, "word/") ? { ok: true } : fail;
    case "xlsx":
      return startsWith(bytes, ZIP) && zipHas(bytes, "xl/") ? { ok: true } : fail;
    case "pptx":
      return startsWith(bytes, ZIP) && zipHas(bytes, "ppt/") ? { ok: true } : fail;
    case "odt":
      return startsWith(bytes, ZIP) ? { ok: true } : fail;
    case "doc":
    case "xls":
    case "ppt":
    case "msg":
      return startsWith(bytes, OLE) ? { ok: true } : fail;
    case "rtf":
      return latin1(bytes, 0, 8).startsWith("{\\rtf") ? { ok: true } : fail;
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ? { ok: true } : fail;
    case "jpg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]) ? { ok: true } : fail;
    case "txt":
    case "csv":
    case "eml":
      return looksLikeText(bytes) ? { ok: true } : fail;
  }
}
