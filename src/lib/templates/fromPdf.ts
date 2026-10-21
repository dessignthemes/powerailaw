"use client";

import { openPdf, openProblemMessages } from "@/lib/pdf/pdfjsClient";
import { outlineFromParagraphs, type Para } from "@/lib/templates/fromDocx";

// Reads a checklist PDF (e.g. a Word checklist saved as PDF) into a template, the
// same way as the Word import: bullet lines are steps, other lines are section
// headings, a long step that wraps onto the next line stays one step, and the
// first line can be the template's name. Runs in the browser; nothing is uploaded.
// A scanned PDF (a picture of a page) has no text to read.

// Bullet / checkbox glyphs, including the private-use characters Word's
// Symbol and Wingdings bullets turn into.
const BULLET = /^(?:[\uE000-\uF8FF•●○◦▪▫■□☐❑❒➢➤►‣⁃✓✔◆◇§]|[-–—*](?=\s|$)|o(?=\s))/;

type Item = { x: number; y: number; s: string; font: string; h: number };
type Line = { x: number; textX: number; text: string; bullet: boolean; font: string };

function linesOf(items: Item[]): Line[] {
  // Same row = within ~a third of the text height.
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= Math.max(2, it.h * 0.35)) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => {
    r.sort((a, b) => a.x - b.x);
    let bullet = false;
    let start = 0;
    const first = r[0].s.trim();
    if (BULLET.test(first) && (first.length === 1 || r.length > 1 && first.length <= 2)) {
      bullet = true;
      start = 1; // the bullet is its own piece of text
    } else if (BULLET.test(first) && /^\S\s+\S/.test(first)) {
      bullet = true; // "• Step text" in one piece
    }
    const parts = r.slice(start);
    let text = parts.map((p) => p.s).join(" ").replace(/\s+/g, " ").trim();
    if (bullet && start === 0) text = text.replace(BULLET, "").trim();
    const textItem = parts[0] ?? r[0];
    return { x: r[0].x, textX: textItem.x, text, bullet, font: textItem.font };
  }).filter((l) => l.text && !/^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(l.text)); // drop page numbers
}

const HEADINGISH = /^(?:\d{1,3}[.)]|[A-Z][.)])\s+\S/;

export async function templateFromPdf(file: File): Promise<{ name: string; text: string }> {
  if (file.size > 20 * 1024 * 1024) throw new Error("That PDF is over 20 MB. Please use a smaller file.");
  const opened = await openPdf(new Uint8Array(await file.arrayBuffer()));
  if ("problem" in opened) throw new Error(openProblemMessages[opened.problem]);
  const { doc, close } = opened;
  const lines: Line[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items: Item[] = [];
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        items.push({ x: it.transform[4], y: it.transform[5], s: it.str, font: it.fontName, h: Math.abs(it.transform[3]) || it.height || 10 });
      }
      lines.push(...linesOf(items));
    }
  } finally {
    await close();
  }
  if (!lines.length) throw new Error("No text was found in that PDF. If it's a scan (a picture of the page), open the original Word file and use Import from Word instead.");

  // The font used for steps; headings and the title are usually in another (bold) font.
  const count = new Map<string, number>();
  for (const l of lines) if (l.bullet) count.set(l.font, (count.get(l.font) ?? 0) + 1);
  const stepFont = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Lines → paragraphs: a non-bullet line lined up with the previous step's text
  // (not a heading) is that step wrapping onto the next line.
  const paras: Para[] = [];
  let lastStep: { para: Para; textX: number } | null = null;
  for (const l of lines) {
    if (l.bullet) {
      const para = { text: l.text, list: true, bold: false, heading: false };
      paras.push(para);
      lastStep = { para, textX: l.textX };
      continue;
    }
    if (lastStep && Math.abs(l.x - lastStep.textX) <= 4 && !HEADINGISH.test(l.text)) {
      lastStep.para.text = `${lastStep.para.text} ${l.text}`.replace(/\s+/g, " ");
      continue;
    }
    lastStep = null;
    paras.push({ text: l.text, list: false, bold: !!stepFont && l.font !== stepFont, heading: false });
  }
  return outlineFromParagraphs(paras, "PDF");
}
