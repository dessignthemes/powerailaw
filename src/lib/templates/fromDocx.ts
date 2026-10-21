import { unzipSync, strFromU8 } from "fflate";

// Reads a Word checklist (.docx) into the text form the template editor understands:
//   heading lines on their own ("1. CLIENT INTAKE FORM"), steps as "☐ step".
// Steps are Word list items (bullets / numbering) or lines that start with a
// checkbox or bullet character. A bold first line before the first section is
// the template's name. Lettered sub-headings ("A. Identity Documents") are kept
// under their numbered section ("3. DOCUMENT COLLECTION — A. Identity Documents").
// Runs in the browser; the file isn't uploaded anywhere.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SYMBOL_START = /^[*\-+•◦▪▫●○■□☐☑☒✓✔–—➢➤►‣⁃]/;
const NUMBERED_HEADING = /^\d{1,3}[.)]\s+\S/;
const LETTERED_HEADING = /^[A-Z][.)]\s+\S/;

export type Para = { text: string; list: boolean; bold: boolean; heading: boolean };

function paragraphs(xml: string): Para[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: Para[] = [];
  const ps = doc.getElementsByTagNameNS(W, "p");
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    let text = "";
    // Text, tabs, line breaks and Word's own checkbox symbols, in order.
    const walk = (n: Element) => {
      for (const c of Array.from(n.children)) {
        if (c.namespaceURI === W && c.localName === "t") text += c.textContent ?? "";
        else if (c.namespaceURI === W && (c.localName === "tab" || c.localName === "br")) text += " ";
        else if (c.namespaceURI === W && c.localName === "sym") text += "☐ ";
        else if (c.localName === "checkbox") text += "☐ ";
        else if (!(c.namespaceURI === W && c.localName === "pPr")) walk(c);
      }
    };
    walk(p);
    text = text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const pPr = p.getElementsByTagNameNS(W, "pPr")[0];
    const style = pPr?.getElementsByTagNameNS(W, "pStyle")[0]?.getAttributeNS(W, "val") ?? pPr?.getElementsByTagNameNS(W, "pStyle")[0]?.getAttribute("w:val") ?? "";
    const list = !!pPr?.getElementsByTagNameNS(W, "numPr").length || /list/i.test(style);
    const runs = Array.from(p.getElementsByTagNameNS(W, "r")).filter((r) => (r.textContent ?? "").trim());
    const bold = runs.length > 0 && runs.every((r) => r.getElementsByTagNameNS(W, "b").length > 0) || /heading|title/i.test(style);
    out.push({ text, list, bold, heading: /heading|title/i.test(style) });
  }
  return out;
}

export async function templateFromDocx(file: File): Promise<{ name: string; text: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error("That file is over 10 MB. Please use a smaller Word file.");
  let xml: string;
  try {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" });
    if (!files["word/document.xml"]) throw new Error("no document");
    xml = strFromU8(files["word/document.xml"]);
  } catch {
    throw new Error("That doesn't look like a Word (.docx) file. In Word, use File → Save As → Word Document (.docx).");
  }
  const paras = paragraphs(xml);
  return outlineFromParagraphs(paras, "Word file");
}

// Shared by the Word and PDF imports: paragraphs (text, list item?, bold?) →
// the template name and the outline text the template editor reads.
export function outlineFromParagraphs(paras: Para[], what: string): { name: string; text: string } {
  if (!paras.length) throw new Error(`The ${what} is empty.`);

  const isStep = (p: Para) => p.list || SYMBOL_START.test(p.text);
  const firstStep = paras.findIndex(isStep);

  // The name: a first line before any step that isn't itself a numbered section.
  let name = "";
  let start = 0;
  const first = paras[0];
  if (first && !isStep(first) && !NUMBERED_HEADING.test(first.text) && (first.bold || first.heading || (firstStep > 1 && !isStep(paras[1])))) {
    name = first.text.slice(0, 80);
    start = 1;
  }

  const lines: string[] = [];
  let parent = ""; // the current numbered section, for lettered sub-sections
  for (let i = start; i < paras.length; i++) {
    const p = paras[i];
    if (isStep(p)) {
      lines.push(SYMBOL_START.test(p.text) ? p.text : `☐ ${p.text}`);
      continue;
    }
    if (NUMBERED_HEADING.test(p.text)) {
      parent = p.text;
      // Leave it out when sub-sections follow straight away; they carry its name.
      const next = paras[i + 1];
      if (next && !isStep(next) && LETTERED_HEADING.test(next.text)) continue;
      lines.push("", p.text);
      continue;
    }
    if (LETTERED_HEADING.test(p.text) && parent) {
      lines.push("", `${parent} — ${p.text}`);
      continue;
    }
    lines.push("", p.text);
  }
  const text = lines.join("\n").replace(/^\n+/, "");
  if (!text.trim()) throw new Error(`No checklist steps were found in the ${what}.`);
  return { name, text };
}
