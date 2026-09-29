// Converts a Word (.docx) file to a text-based PDF (searchable and editable
// in Power PDF). mammoth reads the Word structure as simple HTML; this file
// lays it out with pdf-lib. It keeps headings, paragraphs, bold, italic,
// underline, strikethrough, links, lists, tables, images and footnotes.
// Exact Word layout (fonts, colors, alignment, headers and footers) isn't
// kept, which is why the Word original is always saved alongside.
//
// No DOM or Node APIs are used, so the same code runs in the browser and in
// tests.

import { PDFDocument, PDFFont, PDFPage, PDFImage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type FontFiles = { regular: ArrayBuffer; bold: ArrayBuffer; italic: ArrayBuffer; boldItalic: ArrayBuffer };

export class ConvertError extends Error {}

// ── Tiny HTML parser (mammoth's output is simple and well-formed) ─────────

type El = { tag: string; attrs: Record<string, string>; children: Node[] };
type Node = El | string;

const VOID = new Set(["br", "img", "hr"]);

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos" || k === "#39") return "'";
    if (k === "nbsp") return "\u00a0";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  });
}

export function parseHtml(html: string): El {
  const root: El = { tag: "root", attrs: {}, children: [] };
  const stack: El[] = [root];
  const re = /<\/?([a-zA-Z0-9]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[3] !== undefined) {
      top.children.push(decodeEntities(m[3]));
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith("</")) {
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs: Record<string, string> = {};
    const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[2] ?? ""))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    const el: El = { tag, attrs, children: [] };
    top.children.push(el);
    if (!VOID.has(tag) && !m[0].endsWith("/>")) stack.push(el);
  }
  return root;
}

// ── Layout model ──────────────────────────────────────────────────────────

type Style = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; link: boolean; script: "" | "sup" | "sub" };
type Run = { text: string; style: Style } | { br: true };
type Block =
  | { kind: "text"; runs: Run[]; size: number; before: number; after: number; indent: number; prefix?: string; bold?: boolean }
  | { kind: "image"; src: string; indent: number }
  | { kind: "table"; rows: Cell[][]; indent: number }
  | { kind: "rule" };
type Cell = { blocks: Block[]; header: boolean; colspan: number };

const plain: Style = { bold: false, italic: false, underline: false, strike: false, link: false, script: "" };
const HEADING: Record<string, { size: number; before: number; after: number }> = {
  h1: { size: 20, before: 14, after: 6 },
  h2: { size: 16, before: 12, after: 5 },
  h3: { size: 13.5, before: 10, after: 4 },
  h4: { size: 12, before: 8, after: 3 },
  h5: { size: 11, before: 8, after: 3 },
  h6: { size: 11, before: 8, after: 3 },
};
const BODY = 11;
const LIST_INDENT = 20;

function inlineRuns(nodes: Node[], style: Style, out: Run[], images: string[]) {
  for (const n of nodes) {
    if (typeof n === "string") {
      out.push({ text: n, style });
      continue;
    }
    switch (n.tag) {
      case "strong":
      case "b":
        inlineRuns(n.children, { ...style, bold: true }, out, images);
        break;
      case "em":
      case "i":
        inlineRuns(n.children, { ...style, italic: true }, out, images);
        break;
      case "u":
        inlineRuns(n.children, { ...style, underline: true }, out, images);
        break;
      case "s":
      case "strike":
      case "del":
        inlineRuns(n.children, { ...style, strike: true }, out, images);
        break;
      case "sup":
        inlineRuns(n.children, { ...style, script: "sup" }, out, images);
        break;
      case "sub":
        inlineRuns(n.children, { ...style, script: "sub" }, out, images);
        break;
      case "a":
        inlineRuns(n.children, n.attrs.href ? { ...style, link: true } : style, out, images);
        break;
      case "br":
        out.push({ br: true });
        break;
      case "img":
        if (n.attrs.src) images.push(n.attrs.src);
        break;
      default:
        inlineRuns(n.children, style, out, images);
    }
  }
}

// Turns block-level HTML into layout blocks.
function toBlocks(nodes: Node[], indent: number, out: Block[], size = BODY) {
  const pendingInline: Node[] = [];
  const flushInline = () => {
    if (!pendingInline.length) return;
    const runs: Run[] = [];
    const images: string[] = [];
    inlineRuns(pendingInline.splice(0), plain, runs, images);
    if (runs.some((r) => "br" in r || r.text.trim())) out.push({ kind: "text", runs, size, before: 0, after: 6, indent });
    for (const src of images) out.push({ kind: "image", src, indent });
  };

  for (const n of nodes) {
    if (typeof n === "string" || !isBlockTag(n.tag)) {
      pendingInline.push(n);
      continue;
    }
    flushInline();
    if (n.tag === "p" || n.tag in HEADING) {
      const h = HEADING[n.tag];
      const runs: Run[] = [];
      const images: string[] = [];
      inlineRuns(n.children, h ? { ...plain, bold: true } : plain, runs, images);
      out.push({ kind: "text", runs, size: h?.size ?? size, before: h?.before ?? 0, after: h?.after ?? 6, indent });
      for (const src of images) out.push({ kind: "image", src, indent });
    } else if (n.tag === "ul" || n.tag === "ol") {
      let i = Number(n.attrs.start) || 1;
      for (const li of n.children) {
        if (typeof li === "string" || li.tag !== "li") continue;
        const prefix = n.tag === "ol" ? `${i++}.` : indent >= LIST_INDENT * 2 ? "–" : "•";
        const inner: Block[] = [];
        toBlocks(li.children, indent + LIST_INDENT, inner, size);
        const firstText = inner.find((b) => b.kind === "text");
        if (firstText && firstText.kind === "text" && inner[0] === firstText) firstText.prefix = prefix;
        else inner.unshift({ kind: "text", runs: [], size, before: 0, after: 2, indent: indent + LIST_INDENT, prefix });
        for (const b of inner) if (b.kind === "text") b.after = Math.min(b.after, 3);
        out.push(...inner);
      }
      const last = out[out.length - 1];
      if (last?.kind === "text") last.after = 6;
    } else if (n.tag === "table") {
      const rows: Cell[][] = [];
      const collectRows = (els: Node[]) => {
        for (const r of els) {
          if (typeof r === "string") continue;
          if (r.tag === "tr") {
            const cells: Cell[] = [];
            for (const c of r.children) {
              if (typeof c === "string" || (c.tag !== "td" && c.tag !== "th")) continue;
              const blocks: Block[] = [];
              toBlocks(c.children, 0, blocks, 10);
              cells.push({ blocks, header: c.tag === "th", colspan: Math.max(1, Number(c.attrs.colspan) || 1) });
            }
            if (cells.length) rows.push(cells);
          } else collectRows(r.children);
        }
      };
      collectRows(n.children);
      if (rows.length) out.push({ kind: "table", rows, indent });
    } else if (n.tag === "hr") {
      out.push({ kind: "rule" });
    } else {
      toBlocks(n.children, n.tag === "blockquote" ? indent + LIST_INDENT : indent, out, size);
    }
  }
  flushInline();
}

function isBlockTag(tag: string) {
  return ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "div", "blockquote", "hr", "section", "article", "root"].includes(tag);
}

// ── Rendering ─────────────────────────────────────────────────────────────

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 72;
const INK = rgb(0.07, 0.07, 0.06);
const LINK = rgb(0.1, 0.3, 0.75);
const GRID = rgb(0.72, 0.7, 0.66);
const HEAD_FILL = rgb(0.95, 0.94, 0.91);
const PX = 0.75; // image pixels are shown at 96 dpi, like Word

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont };
type Seg = { text: string; font: PDFFont; size: number; width: number; style: Style; space: boolean };
type Line = { segs: Seg[]; width: number; height: number; ascent: number };

const fontFor = (f: Fonts, s: Style) => (s.bold ? (s.italic ? f.boldItalic : f.bold) : s.italic ? f.italic : f.regular);

// Characters the font can't show would print as boxes; tabs become spaces.
function clean(text: string) {
  return text.replace(/\t/g, "    ").replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\ufeff]/g, "");
}

function layoutLines(fonts: Fonts, runs: Run[], size: number, width: number, firstIndent = 0): Line[] {
  const lines: Line[] = [];
  let cur: Seg[] = [];
  let curW = 0;
  const lineH = size * 1.3;
  const push = () => {
    while (cur.length && cur[cur.length - 1].space) curW -= cur.pop()!.width;
    const maxSize = Math.max(size, ...cur.map((s) => s.size));
    lines.push({ segs: cur, width: curW, height: Math.max(lineH, maxSize * 1.3), ascent: maxSize * 0.95 });
    cur = [];
    curW = 0;
  };
  const avail = () => width - (lines.length === 0 ? firstIndent : 0);

  for (const r of runs) {
    if ("br" in r) {
      push();
      continue;
    }
    const s = r.style;
    const font = fontFor(fonts, s);
    const sz = s.script ? size * 0.7 : size;
    for (const piece of clean(r.text).split(/([ \n\r\u2028]+)/)) {
      if (!piece) continue;
      if (/^[ \n\r\u2028]+$/.test(piece)) {
        if (!cur.length || cur[cur.length - 1].space) continue;
        const w = font.widthOfTextAtSize(" ", sz);
        cur.push({ text: " ", font, size: sz, width: w, style: s, space: true });
        curW += w;
        continue;
      }
      let word = piece;
      let w = font.widthOfTextAtSize(word, sz);
      if (curW + w > avail() && cur.some((x) => !x.space)) push();
      // A word wider than the line is split across lines.
      while (w > avail() && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), sz) > avail() - curW) n--;
        const part = word.slice(0, n);
        cur.push({ text: part, font, size: sz, width: font.widthOfTextAtSize(part, sz), style: s, space: false });
        push();
        word = word.slice(n);
        w = font.widthOfTextAtSize(word, sz);
      }
      cur.push({ text: word, font, size: sz, width: w, style: s, space: false });
      curW += w;
    }
  }
  if (cur.length || lines.length === 0) push();
  return lines;
}

function drawLine(page: PDFPage, line: Line, x: number, top: number, color: RGB = INK) {
  const baseline = top - line.ascent;
  let cx = x;
  for (const seg of line.segs) {
    const c = seg.style.link ? LINK : color;
    const dy = seg.style.script === "sup" ? seg.size * 0.55 : seg.style.script === "sub" ? -seg.size * 0.2 : 0;
    if (!seg.space) page.drawText(seg.text, { x: cx, y: baseline + dy, size: seg.size, font: seg.font, color: c });
    if (seg.style.underline || seg.style.link) {
      page.drawLine({ start: { x: cx, y: baseline - 1.5 }, end: { x: cx + seg.width, y: baseline - 1.5 }, thickness: 0.6, color: c });
    }
    if (seg.style.strike) {
      const y = baseline + seg.size * 0.3;
      page.drawLine({ start: { x: cx, y }, end: { x: cx + seg.width, y }, thickness: 0.6, color: c });
    }
    cx += seg.width;
  }
}

class Writer {
  page!: PDFPage;
  y = 0;
  pages = 0;
  constructor(public doc: PDFDocument, public fonts: Fonts, public images: Map<string, PDFImage | null>) {
    this.newPage();
  }
  get contentW() {
    return PAGE_W - 2 * MARGIN;
  }
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.pages++;
  }
  atTop() {
    return this.y >= PAGE_H - MARGIN - 0.01;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN && !this.atTop()) this.newPage();
  }

  text(b: Extract<Block, { kind: "text" }>, x0 = MARGIN, width = this.contentW) {
    const x = x0 + b.indent;
    const w = width - b.indent;
    if (!this.atTop()) this.y -= b.before;
    const lines = layoutLines(this.fonts, b.runs, b.size, w);
    const isHeading = b.before > 0;
    lines.forEach((line, i) => {
      // Keep a heading with the first lines that follow it.
      this.ensure(line.height + (isHeading && i === lines.length - 1 ? b.size * 2.6 : 0));
      if (i === 0 && b.prefix) {
        const pw = this.fonts.regular.widthOfTextAtSize(b.prefix, b.size);
        this.page.drawText(b.prefix, { x: x - Math.max(pw + 6, 12), y: this.y - line.ascent, size: b.size, font: this.fonts.regular, color: INK });
      }
      drawLine(this.page, line, x, this.y);
      this.y -= line.height;
    });
    this.y -= b.after;
  }

  image(b: Extract<Block, { kind: "image" }>) {
    const img = this.images.get(b.src);
    if (!img) return;
    const maxW = this.contentW - b.indent;
    const maxH = PAGE_H - 2 * MARGIN;
    const scale = Math.min(PX, maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    this.ensure(h + 6);
    this.page.drawImage(img, { x: MARGIN + b.indent, y: this.y - h, width: w, height: h });
    this.y -= h + 8;
  }

  // Height of blocks laid out in a given width (for table cells).
  measure(blocks: Block[], width: number) {
    let h = 0;
    for (const b of blocks) {
      if (b.kind === "text") {
        h += layoutLines(this.fonts, b.runs, b.size, width - b.indent).reduce((a, l) => a + l.height, 0) + b.after;
      } else if (b.kind === "image") {
        const img = this.images.get(b.src);
        if (img) h += img.height * Math.min(PX, width / img.width) + 4;
      }
    }
    return Math.max(h - 4, 10 * 1.3);
  }

  table(b: Extract<Block, { kind: "table" }>) {
    const cols = Math.max(...b.rows.map((r) => r.reduce((a, c) => a + c.colspan, 0)));
    const x0 = MARGIN + b.indent;
    const colW = (this.contentW - b.indent) / cols;
    const pad = 4;
    this.y -= 2;
    for (const row of b.rows) {
      let span = 0;
      const cells = row.map((c) => {
        const x = x0 + span * colW;
        const w = colW * c.colspan;
        span += c.colspan;
        return { c, x, w, h: this.measure(c.blocks, w - 2 * pad) };
      });
      const rowH = Math.max(...cells.map((c) => c.h)) + 2 * pad;
      if (rowH > PAGE_H - 2 * MARGIN) {
        // A single row taller than a page: flow its cells as ordinary text.
        for (const cell of cells) this.flow(cell.c.blocks);
        continue;
      }
      this.ensure(rowH);
      const top = this.y;
      for (const cell of cells) {
        this.page.drawRectangle({
          x: cell.x,
          y: top - rowH,
          width: cell.w,
          height: rowH,
          borderColor: GRID,
          borderWidth: 0.5,
          color: cell.c.header ? HEAD_FILL : undefined,
        });
        let cy = top - pad;
        for (const blk of cell.c.blocks) {
          if (blk.kind === "text") {
            const runs = cell.c.header ? blk.runs.map((r) => ("br" in r ? r : { ...r, style: { ...r.style, bold: true } })) : blk.runs;
            for (const line of layoutLines(this.fonts, runs, blk.size, cell.w - 2 * pad - blk.indent)) {
              drawLine(this.page, line, cell.x + pad + blk.indent, cy);
              cy -= line.height;
            }
            cy -= blk.after;
          } else if (blk.kind === "image") {
            const img = this.images.get(blk.src);
            if (!img) continue;
            const s = Math.min(PX, (cell.w - 2 * pad) / img.width);
            this.page.drawImage(img, { x: cell.x + pad, y: cy - img.height * s, width: img.width * s, height: img.height * s });
            cy -= img.height * s + 4;
          }
        }
      }
      this.y = top - rowH;
    }
    this.y -= 10;
  }

  flow(blocks: Block[]) {
    for (const b of blocks) {
      if (b.kind === "text") this.text(b);
      else if (b.kind === "image") this.image(b);
      else if (b.kind === "table") this.table(b);
      else {
        this.ensure(12);
        this.page.drawLine({ start: { x: MARGIN, y: this.y - 6 }, end: { x: PAGE_W - MARGIN, y: this.y - 6 }, thickness: 0.5, color: GRID });
        this.y -= 12;
      }
    }
  }
}

function collectImageSrcs(blocks: Block[], out: Set<string>) {
  for (const b of blocks) {
    if (b.kind === "image") out.add(b.src);
    if (b.kind === "table") for (const r of b.rows) for (const c of r) collectImageSrcs(c.blocks, out);
  }
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export type ConvertResult = { pdf: Uint8Array; pageCount: number; skippedImages: number };

export async function htmlToPdf(html: string, fontFiles: FontFiles, title: string): Promise<ConvertResult> {
  const blocks: Block[] = [];
  toBlocks(parseHtml(html).children, 0, blocks);
  // Leading empty paragraphs would leave a blank top.
  while (blocks[0]?.kind === "text" && !blocks[0].runs.some((r) => "br" in r || r.text.trim())) blocks.shift();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(fontFiles.regular, { subset: true }),
    doc.embedFont(fontFiles.bold, { subset: true }),
    doc.embedFont(fontFiles.italic, { subset: true }),
    doc.embedFont(fontFiles.boldItalic, { subset: true }),
  ]);

  const srcs = new Set<string>();
  collectImageSrcs(blocks, srcs);
  const images = new Map<string, PDFImage | null>();
  let skippedImages = 0;
  for (const src of srcs) {
    const m = src.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    try {
      if (!m) throw new Error("unsupported");
      const bytes = base64ToBytes(m[2]);
      images.set(src, m[1].toLowerCase() === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
    } catch {
      images.set(src, null);
      skippedImages++;
    }
  }

  const w = new Writer(doc, { regular, bold, italic, boldItalic }, images);
  w.flow(blocks);

  doc.setTitle(title.replace(/\.[a-z0-9]{2,5}$/i, ""));
  doc.setProducer("LawPower AI");
  doc.setCreator("LawPower AI Documents");
  const pdf = await doc.save();
  return { pdf, pageCount: doc.getPageCount(), skippedImages };
}

export async function docxToPdf(docx: ArrayBuffer, fontFiles: FontFiles, title: string): Promise<ConvertResult> {
  const mammoth = await import("mammoth");
  let html: string;
  try {
    // The browser build of mammoth reads arrayBuffer; the Node build reads buffer.
    const input = { arrayBuffer: docx, buffer: new Uint8Array(docx) } as unknown as Parameters<typeof mammoth.convertToHtml>[0];
    const res = await mammoth.convertToHtml(input, {
      ignoreEmptyParagraphs: false,
    });
    html = res.value;
  } catch {
    throw new ConvertError("This Word file couldn't be read. Open it in Word, save it again as .docx and upload that copy.");
  }
  if (!html.replace(/<[^>]+>/g, "").trim() && !/<img/i.test(html)) {
    throw new ConvertError("No text was found in this Word file, so there's nothing to convert.");
  }
  return htmlToPdf(html, fontFiles, title);
}
