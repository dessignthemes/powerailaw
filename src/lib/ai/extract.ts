import "server-only";

// Server-side text extraction for PDF, DOCX and TXT, producing chunks with
// stable source references: real page numbers for PDFs, heading + paragraph
// ranges for DOCX, line ranges for TXT. Nothing here is logged.

export type FileKind = "pdf" | "docx" | "txt";

export type ExtractedChunk = { index: number; page: number | null; section: string | null; content: string };

export type Extraction =
  | { status: "ready"; kind: FileKind; pageCount: number | null; chunks: ExtractedChunk[]; detail?: string }
  | { status: "needs_ocr"; kind: FileKind; pageCount: number | null; chunks: ExtractedChunk[]; detail: string }
  | { status: "failed"; kind: FileKind | null; detail: string };

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 400;
const MAX_TOTAL_CHARS = 1_500_000;
const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;

export const MIME_BY_KIND: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

// Decide the real type from the bytes, not the file name.
export function detectKind(bytes: Uint8Array): FileKind | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // A DOCX is a zip whose directory lists word/document.xml.
    const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 256 * 1024)));
    if (tail.includes("word/document.xml")) return "docx";
    return null;
  }
  // Plain text: valid UTF-8, no NUL bytes.
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length < bytes.length ? trimToCharBoundary(sample) : sample);
    return "txt";
  } catch {
    return null;
  }
}

function trimToCharBoundary(b: Uint8Array) {
  let end = b.length;
  // Step back over a partial multi-byte sequence at the cut.
  for (let i = 0; i < 4 && end > 0 && (b[end - 1] & 0xc0) === 0x80; i++) end--;
  if (end > 0 && b[end - 1] >= 0xc0) end--;
  return b.subarray(0, end);
}

function splitText(text: string): string[] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + CHUNK_CHARS);
    if (end < clean.length) {
      // Prefer to break at a paragraph, then sentence, then space.
      const window = clean.slice(start, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (cut > CHUNK_CHARS * 0.5) end = start + cut + 1;
      else {
        const sp = window.lastIndexOf(" ");
        if (sp > CHUNK_CHARS * 0.5) end = start + sp;
      }
    }
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return out.filter(Boolean);
}

// ── PDF ───────────────────────────────────────────────────────────────────

async function extractPdf(bytes: Uint8Array): Promise<Extraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, stopAtErrors: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") return { status: "failed", kind: "pdf", detail: "This PDF is password-protected. Remove the password and upload it again." };
    return { status: "failed", kind: "pdf", detail: "This PDF appears to be damaged and couldn't be read." };
  }

  const pageCount = doc.numPages;
  if (pageCount > MAX_PAGES) {
    await task.destroy();
    return { status: "failed", kind: "pdf", detail: `This PDF has ${pageCount} pages; the limit is ${MAX_PAGES}.` };
  }

  const chunks: ExtractedChunk[] = [];
  let emptyPages = 0;
  let total = 0;
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let text = "";
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      text += it.str + (it.hasEOL ? "\n" : " ");
    }
    text = text.replace(/[ \t]{2,}/g, " ").trim();
    if (text.replace(/\s/g, "").length < 15) {
      emptyPages++;
      continue;
    }
    total += text.length;
    if (total > MAX_TOTAL_CHARS) break;
    for (const c of splitText(text)) chunks.push({ index: chunks.length, page: p, section: null, content: c });
  }
  await task.destroy();

  if (chunks.length === 0) {
    return {
      status: "needs_ocr",
      kind: "pdf",
      pageCount,
      chunks: [],
      detail: "No readable text was found. This looks like a scanned PDF, which needs OCR (text recognition). OCR isn't set up in LawPower AI yet, so the assistant can't read this file.",
    };
  }
  const detail =
    emptyPages > 0
      ? `${emptyPages} of ${pageCount} pages had no readable text (they may be scanned images) and can't be searched without OCR.`
      : undefined;
  return { status: "ready", kind: "pdf", pageCount, chunks, detail };
}

// ── DOCX ──────────────────────────────────────────────────────────────────

function decodeEntities(s: string) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractDocx(bytes: Uint8Array): Promise<Extraction> {
  const mammoth = await import("mammoth");
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
  } catch {
    return { status: "failed", kind: "docx", detail: "This Word document appears to be damaged and couldn't be read." };
  }

  // Walk headings and paragraph-level blocks in order.
  const blocks: { heading: boolean; text: string }[] = [];
  const re = /<(h[1-6]|p|li|td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = decodeEntities(m[2]);
    if (text) blocks.push({ heading: m[1].toLowerCase().startsWith("h"), text });
  }
  if (blocks.length === 0) {
    return { status: "failed", kind: "docx", detail: "No text was found in this Word document." };
  }

  const chunks: ExtractedChunk[] = [];
  let heading: string | null = null;
  let para = 0;
  let buf: string[] = [];
  let bufStart = 0;
  let total = 0;
  const flush = () => {
    if (!buf.length) return;
    const range = bufStart === para ? `¶ ${para}` : `¶ ${bufStart}–${para}`;
    const section = heading ? `${heading.slice(0, 80)} (${range})` : range;
    for (const c of splitText(buf.join("\n\n"))) chunks.push({ index: chunks.length, page: null, section, content: c });
    buf = [];
  };
  for (const b of blocks) {
    if (b.heading) {
      flush();
      heading = b.text;
      continue;
    }
    para++;
    total += b.text.length;
    if (total > MAX_TOTAL_CHARS) break;
    if (!buf.length) bufStart = para;
    buf.push(b.text);
    if (buf.join("\n\n").length >= CHUNK_CHARS) flush();
  }
  flush();
  return { status: "ready", kind: "docx", pageCount: null, chunks };
}

// ── TXT ───────────────────────────────────────────────────────────────────

function extractTxt(bytes: Uint8Array): Extraction {
  const text = new TextDecoder("utf-8").decode(bytes).slice(0, MAX_TOTAL_CHARS);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const chunks: ExtractedChunk[] = [];
  let buf: string[] = [];
  let start = 1;
  lines.forEach((line, i) => {
    if (!buf.length) start = i + 1;
    buf.push(line);
    const joined = buf.join("\n");
    if (joined.length >= CHUNK_CHARS || i === lines.length - 1) {
      const content = joined.trim();
      if (content) chunks.push({ index: chunks.length, page: null, section: `lines ${start}–${i + 1}`, content });
      buf = [];
    }
  });
  if (!chunks.length) return { status: "failed", kind: "txt", detail: "This text file is empty." };
  return { status: "ready", kind: "txt", pageCount: null, chunks };
}

export async function extractText(bytes: Uint8Array): Promise<Extraction> {
  if (bytes.byteLength === 0) return { status: "failed", kind: null, detail: "That file is empty." };
  if (bytes.byteLength > MAX_FILE_BYTES) return { status: "failed", kind: null, detail: "Files must be 15 MB or smaller." };
  const kind = detectKind(bytes);
  if (!kind) return { status: "failed", kind: null, detail: "Only PDF, Word (.docx) and plain-text (.txt) files are supported." };
  if (kind === "pdf") return extractPdf(bytes);
  if (kind === "docx") return extractDocx(bytes);
  return extractTxt(bytes);
}
