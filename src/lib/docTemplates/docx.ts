import "server-only";
import { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak, UnderlineType } from "docx";

// Turns a filled template (see format.ts for the light formatting) into a Word file.
function runs(text: string, base: { bold?: boolean } = {}): TextRun[] {
  // **bold** inside a line; underscores stay as they are (signature and date blanks).
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((p) =>
      p.startsWith("**") && p.endsWith("**")
        ? new TextRun({ text: p.slice(2, -2), bold: true, font: "Times New Roman", size: 24 })
        : new TextRun({ text: p, bold: base.bold, font: "Times New Roman", size: 24 })
    );
}

export async function templateToDocx(filled: string): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];
  const lines = filled.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "---") {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [], spacing: { after: 0 } }));
      continue;
    }
    if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: line.slice(2).trim(), bold: true, underline: { type: UnderlineType.SINGLE }, font: "Times New Roman", size: 28 })] }));
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: runs(line.slice(3).trim(), { bold: true }) }));
      continue;
    }
    if (line.startsWith("::")) {
      paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: runs(line.slice(2).trim()) }));
      continue;
    }
    if (line.startsWith(">>")) {
      paragraphs.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 120 }, children: runs(line.slice(2).trim()) }));
      continue;
    }
    paragraphs.push(new Paragraph({ spacing: { after: 120 }, children: runs(line) }));
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: paragraphs }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
