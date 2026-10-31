// Template maker: works on the firm's own Word file so its formatting (fonts,
// spacing, numbering, letterhead, tables) is kept. Text chosen as a field is
// swapped for {{field_key}} inside the document's XML, even when Word has split
// the words across several "runs"; optional clauses get {{#key}} … {{/key}}
// paragraphs around them. Generation then fills these in with docxtemplater.
import PizZip from "pizzip";

const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
const PARA = /<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
const TEXT = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)|<w:t(?:\s[^>]*)?\/>/g;

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function openDocx(bytes: Uint8Array): PizZip {
  try {
    const zip = new PizZip(bytes);
    if (!zip.file("word/document.xml")) throw new Error("no document");
    return zip;
  } catch {
    throw new Error("That file isn't a Word document (.docx) that can be read.");
  }
}

// The text of a paragraph, as one string.
function paraText(p: string): string {
  let out = "";
  for (const m of p.matchAll(TEXT)) out += m[2] !== undefined ? decode(m[2]) : "";
  // Tabs and line breaks inside a paragraph read as spaces / new lines.
  return out;
}

// The body's paragraphs in order (the ones the review screen shows and that
// optional-clause markers refer to by number).
export function paragraphs(zip: PizZip): string[] {
  const xml = zip.file("word/document.xml")!.asText();
  return [...xml.matchAll(PARA)].map((m) => paraText(m[0]));
}

export type Replacement = { find: string; key: string; all?: boolean };
export type Block = { start: number; end: number; key: string }; // paragraph numbers, inclusive

// Swap every chosen piece of text for {{key}} inside one paragraph's XML.
function replaceInParagraph(p: string, reps: Replacement[], used: Set<Replacement>): string {
  const nodes = [...p.matchAll(TEXT)].filter((m) => m[2] !== undefined);
  if (!nodes.length) return p;
  const texts = nodes.map((m) => decode(m[2]));
  const full = texts.join("");
  // Where each match starts → [length, tag].
  const hits = new Map<number, [number, string]>();
  for (const r of reps) {
    if (!r.find) continue;
    if (!r.all && used.has(r)) continue;
    let from = 0;
    while (from <= full.length) {
      const i = full.indexOf(r.find, from);
      if (i < 0) break;
      const overlaps = [...hits.entries()].some(([s, [len]]) => i < s + len && s < i + r.find.length);
      if (!overlaps) {
        hits.set(i, [r.find.length, `{{${r.key}}}`]);
        used.add(r);
        if (!r.all) break;
      }
      from = i + r.find.length;
    }
  }
  if (!hits.size) return p;
  // Rebuild each text node: unmatched characters stay in their own node; a
  // match is written where it starts (keeping that node's formatting).
  const out = texts.map(() => "");
  let node = 0;
  let offset = 0; // position of node's first char in full
  const nodeOf = (g: number) => {
    while (node < texts.length - 1 && g >= offset + texts[node].length) {
      offset += texts[node].length;
      node++;
    }
    return node;
  };
  for (let g = 0; g < full.length; ) {
    const n = nodeOf(g);
    const hit = hits.get(g);
    if (hit) {
      out[n] += hit[1];
      g += hit[0];
    } else {
      out[n] += full[g];
      g++;
    }
  }
  let k = 0;
  return p.replace(TEXT, (all, open: string | undefined, _t: string | undefined, close: string | undefined) => {
    if (open === undefined) return all;
    const text = out[k++] ?? "";
    const o = /xml:space=/.test(open) ? open : open.replace("<w:t", '<w:t xml:space="preserve"');
    return `${o}${encode(text)}${close}`;
  });
}

const markerPara = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${encode(text)}</w:t></w:r></w:p>`;

// The Word file with the fields and optional clauses tagged.
export function tagDocx(bytes: Uint8Array, reps: Replacement[], blocks: Block[]): Uint8Array {
  const zip = openDocx(bytes);
  // Longest text first, so "John Smith Jr." wins over "John Smith".
  const ordered = [...reps].filter((r) => r.find.trim()).sort((a, b) => b.find.length - a.find.length);
  const used = new Set<Replacement>();
  for (const name of Object.keys(zip.files)) {
    if (!PARTS.test(name)) continue;
    let xml = zip.file(name)!.asText();
    xml = xml.replace(PARA, (p) => replaceInParagraph(p, ordered, used));
    if (name === "word/document.xml" && blocks.length) {
      // Optional clauses: a marker paragraph before and after (removed when the document is made).
      const list = [...xml.matchAll(PARA)];
      const inserts: { at: number; text: string }[] = [];
      for (const b of blocks) {
        const s = list[b.start];
        const e = list[b.end];
        if (!s || !e || b.end < b.start) continue;
        inserts.push({ at: s.index!, text: markerPara(`{{#${b.key}}}`) });
        inserts.push({ at: e.index! + e[0].length, text: markerPara(`{{/${b.key}}}`) });
      }
      inserts.sort((a, b) => b.at - a.at);
      for (const ins of inserts) xml = xml.slice(0, ins.at) + ins.text + xml.slice(ins.at);
    }
    zip.file(name, xml);
  }
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

// Fill a tagged Word file. values: field → text; optional clauses are kept when
// their value is yes/true/1 (anything else leaves them out).
export async function fillDocx(bytes: Uint8Array, values: Record<string, string>, yesNoKeys: string[]): Promise<Uint8Array> {
  const { default: Docxtemplater } = await import("docxtemplater");
  const zip = openDocx(bytes);
  const data: Record<string, unknown> = { ...values };
  for (const k of yesNoKeys) data[k] = /^(yes|true|1|y|include)$/i.test(String(values[k] ?? "").trim());
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true, // marker paragraphs disappear
    linebreaks: true,
    nullGetter: () => "",
  });
  try {
    doc.render(data);
  } catch (e) {
    const err = e as { properties?: { errors?: { properties?: { explanation?: string } }[] } };
    const why = err.properties?.errors?.map((x) => x.properties?.explanation).filter(Boolean).slice(0, 3).join("; ");
    throw new Error(why ? `The template has a problem: ${why}` : "The template couldn't be filled in.");
  }
  return doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" }) as Uint8Array;
}
