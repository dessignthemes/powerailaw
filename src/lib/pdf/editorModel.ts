import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  type PDFFont,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  PDFOptionList,
  PDFSignature,
  PDFName,
  PDFArray,
  PDFRef,
} from "pdf-lib";

// ── Coordinates ───────────────────────────────────────────────────────────
// Every overlay item is stored in "page units": the page as displayed at
// 100% zoom (pdf.js viewport at scale 1, rotation applied), origin top-left,
// 1 unit = 1 PDF point. Zoom only multiplies these numbers for display, so
// the stored values — and the exported PDF — never depend on zoom.

export type PageGeometry = {
  width: number; // page units
  height: number;
  rotation: number; // 0 | 90 | 180 | 270, the page's /Rotate
  // page units → PDF user space (pdf.js viewport.convertToPdfPoint at scale 1)
  toPdf: (x: number, y: number) => [number, number];
};

export type TextColor = "black" | "blue";

export const textColors: Record<TextColor, { css: string; rgb: [number, number, number] }> = {
  black: { css: "#111111", rgb: [0.067, 0.067, 0.067] },
  blue: { css: "#1F3A93", rgb: [0.122, 0.227, 0.576] },
};

type Base = { id: string; page: number; x: number; y: number; w: number };

export type TextItem = Base & {
  kind: "text";
  text: string;
  fontSize: number;
  color: TextColor;
};

// Visual replacement for existing text: an opaque box drawn over the
// original plus new text on top. The original text is NOT removed from the
// file — it can still be selected, searched, copied or extracted.
export type ReplaceItem = Base & {
  kind: "replace";
  h: number; // cover box height
  text: string;
  originalText: string;
  fontSize: number;
  baseline: number; // baseline offset from the box top, page units
  color: TextColor;
  cover: [number, number, number]; // 0–1 RGB
};

export type SignatureItem = Base & {
  kind: "signature";
  h: number;
  pngDataUrl: string;
  aspect: number; // width / height of the image
};

export type OverlayItem = TextItem | ReplaceItem | SignatureItem;

// ── Text layout (shared by the on-screen preview and the export) ─────────

export const LINE_HEIGHT = 1.2; // × font size
// Where the first baseline sits below the box top, as a multiple of font
// size. Matches CSS line-height 1.2 with Arial/Helvetica metrics
// (ascent .905 + half-leading .0415) so the preview and PDF line up.
export const FIRST_BASELINE = 0.9465;

let fontPromise: Promise<PDFFont> | null = null;

// Helvetica metrics from pdf-lib. Arial (used on screen) is metric-compatible,
// so line breaks computed here are identical on screen and in the PDF.
export function getHelvetica(): Promise<PDFFont> {
  if (!fontPromise) {
    fontPromise = PDFDocument.create().then((d) => d.embedFont(StandardFonts.Helvetica));
  }
  return fontPromise;
}

export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/); // keep whitespace tokens
    let line = "";
    for (const token of words) {
      const candidate = line + token;
      if (line === "" || safeWidth(font, candidate.trimEnd(), size) <= maxWidth) {
        line = candidate;
        continue;
      }
      out.push(line.trimEnd());
      line = token.trimStart();
      // Break a single word that's longer than the box, character by character.
      while (line && safeWidth(font, line, size) > maxWidth) {
        let cut = line.length - 1;
        while (cut > 1 && safeWidth(font, line.slice(0, cut), size) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function safeWidth(font: PDFFont, s: string, size: number) {
  try {
    return font.widthOfTextAtSize(s, size);
  } catch {
    return s.length * size * 0.55; // unsupported chars are rejected before export anyway
  }
}

export function textBoxHeight(lines: number, fontSize: number) {
  return Math.max(1, lines) * fontSize * LINE_HEIGHT;
}

// The standard PDF fonts only cover Western European characters (WinAnsi).
// Return any characters that can't be written so the UI can flag them.
export function unsupportedChars(font: PDFFont, text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text.replace(/\n/g, "")) {
    try {
      font.encodeText(ch);
    } catch {
      bad.add(ch);
    }
  }
  return [...bad];
}

// ── Form fields ───────────────────────────────────────────────────────────

export type FormFieldKind = "text" | "checkbox" | "dropdown" | "radio" | "signature" | "unsupported";

export type FormWidget = {
  fieldName: string;
  kind: FormFieldKind;
  page: number;
  pdfRect: { x: number; y: number; width: number; height: number }; // PDF user space
  option?: string; // radio: the value this widget represents
};

export type FormFieldInfo = {
  name: string;
  kind: FormFieldKind;
  readOnly: boolean;
  multiline: boolean;
  maxLength?: number;
  options: string[];
  value: string | boolean; // current value in the file
};

export async function readFormFields(
  bytes: Uint8Array
): Promise<{ fields: FormFieldInfo[]; widgets: FormWidget[] }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  let form;
  try {
    form = doc.getForm();
  } catch {
    return { fields: [], widgets: [] };
  }

  // Map each page's annotation refs → page index, to find which page a widget is on.
  const refToPage = new Map<string, number>();
  const pageRefToIndex = new Map<string, number>();
  doc.getPages().forEach((p, i) => {
    pageRefToIndex.set(p.ref.toString(), i);
    const annots = p.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    annots?.asArray().forEach((a) => {
      if (a instanceof PDFRef) refToPage.set(a.toString(), i);
    });
  });

  const fields: FormFieldInfo[] = [];
  const widgets: FormWidget[] = [];

  for (const field of form.getFields()) {
    const name = field.getName();
    let kind: FormFieldKind = "unsupported";
    let value: string | boolean = "";
    let options: string[] = [];
    let multiline = false;
    let maxLength: number | undefined;

    try {
      if (field instanceof PDFTextField) {
        kind = "text";
        value = field.getText() ?? "";
        multiline = field.isMultiline();
        maxLength = field.getMaxLength();
      } else if (field instanceof PDFCheckBox) {
        kind = "checkbox";
        value = field.isChecked();
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        kind = "dropdown";
        options = field.getOptions();
        value = field.getSelected()[0] ?? "";
      } else if (field instanceof PDFRadioGroup) {
        kind = "radio";
        options = field.getOptions();
        value = field.getSelected() ?? "";
      } else if (field instanceof PDFSignature) {
        kind = "signature";
      }
    } catch {
      kind = "unsupported";
    }

    fields.push({ name, kind, readOnly: field.isReadOnly(), multiline, maxLength, options, value });

    const ws = field.acroField.getWidgets();
    ws.forEach((w, idx) => {
      const ref = doc.context.getObjectRef(w.dict);
      let page = ref ? refToPage.get(ref.toString()) : undefined;
      if (page === undefined) {
        const p = w.P();
        if (p) page = pageRefToIndex.get(p.toString());
      }
      if (page === undefined) return;
      const r = w.getRectangle();
      if (r.width <= 0 || r.height <= 0) return;
      widgets.push({
        fieldName: name,
        kind,
        page,
        pdfRect: r,
        option: kind === "radio" ? options[idx] : undefined,
      });
    });
  }

  return { fields, widgets };
}

// ── Export ────────────────────────────────────────────────────────────────

export class ExportError extends Error {}

export async function buildEditedPdf(opts: {
  original: Uint8Array;
  pages: PageGeometry[];
  items: OverlayItem[];
  formValues: Record<string, string | boolean>; // only fields the user changed
  formFields: FormFieldInfo[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(opts.original, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // 1. Form values
  const changed = Object.keys(opts.formValues);
  if (changed.length > 0) {
    const form = doc.getForm();
    for (const name of changed) {
      const info = opts.formFields.find((f) => f.name === name);
      const v = opts.formValues[name];
      if (!info || info.readOnly) continue;
      try {
        if (info.kind === "text") form.getTextField(name).setText(String(v));
        else if (info.kind === "checkbox") {
          const cb = form.getCheckBox(name);
          if (v) cb.check();
          else cb.uncheck();
        } else if (info.kind === "dropdown") {
          const f = form.getField(name);
          if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
            if (v) f.select(String(v));
            else f.clear();
          }
        } else if (info.kind === "radio") {
          if (v) form.getRadioGroup(name).select(String(v));
          else form.getRadioGroup(name).clear();
        }
      } catch (e) {
        throw new ExportError(`Couldn't fill the field "${name}": ${(e as Error).message}`);
      }
    }
    try {
      form.updateFieldAppearances(font);
    } catch {
      throw new ExportError(
        "One of the form values contains characters this PDF's fields can't display. Use basic Latin characters and try again."
      );
    }
  }

  // 2. Overlay items, drawn in page order
  const pdfPages = doc.getPages();
  const pngCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (const item of opts.items) {
    const geo = opts.pages[item.page];
    const page = pdfPages[item.page];
    if (!geo || !page) continue;
    const rotate = degrees(geo.rotation);

    if (item.kind === "signature") {
      let img = pngCache.get(item.pngDataUrl);
      if (!img) {
        img = await doc.embedPng(dataUrlToBytes(item.pngDataUrl));
        pngCache.set(item.pngDataUrl, img);
      }
      // Anchor at the item's visual bottom-left; rotating by the page's
      // /Rotate keeps it upright as displayed.
      const [px, py] = geo.toPdf(item.x, item.y + item.h);
      page.drawImage(img, { x: px, y: py, width: item.w, height: item.h, rotate });
      continue;
    }

    const bad = unsupportedChars(font, item.text);
    if (bad.length) {
      throw new ExportError(
        `These characters can't be written with the standard PDF font: ${bad.join(" ")}. Remove them and try again.`
      );
    }
    const [r, g, b] = textColors[item.color].rgb;

    if (item.kind === "replace") {
      const [cx, cy] = geo.toPdf(item.x, item.y + item.h);
      page.drawRectangle({
        x: cx,
        y: cy,
        width: item.w,
        height: item.h,
        rotate,
        color: rgb(...item.cover),
        borderWidth: 0,
      });
      if (item.text.trim()) {
        const [bx, by] = geo.toPdf(item.x, item.y + item.baseline);
        page.drawText(item.text, { x: bx, y: by, size: item.fontSize, font, color: rgb(r, g, b), rotate });
      }
      continue;
    }

    // Plain text box
    const lines = wrapText(font, item.text, item.fontSize, item.w);
    lines.forEach((line, i) => {
      if (!line) return;
      const baselineY = item.y + item.fontSize * FIRST_BASELINE + i * item.fontSize * LINE_HEIGHT;
      const [bx, by] = geo.toPdf(item.x, baselineY);
      page.drawText(line, { x: bx, y: by, size: item.fontSize, font, color: rgb(r, g, b), rotate });
    });
  }

  return doc.save();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
