import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { KEY_DATE_FIELDS, ruleText, usDate, type KeyDatesState } from "@/lib/matters/keyDates";

// The Contingency Dates Letter, on the firm's letterhead
// (src/templates/contingency-dates-letter.docx, built from the firm's own Word file).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Line = { text: string } | { label: string; value: string };

export function letterLines(state: KeyDatesState): Line[] {
  const d = state.dates;
  const f = state.facts ?? {};
  const ar = usDate(d.attorneyReviewCompleted?.date);
  const latest = [...(state.documents ?? [])].reverse().find((x) => /review/i.test(x.type));
  const basis = latest?.date ? `, as modified by the attorney review letter dated ${usDate(latest.date)}` : "";
  const lines: Line[] = [
    {
      text: `Please be advised that attorney review has concluded${ar ? ` as of ${ar}` : ""}. Pursuant to the Contract of Sale${basis}, the following dates now apply:`,
    },
  ];
  for (const field of KEY_DATE_FIELDS) {
    if (field.key === "contractSigned" || field.key === "attorneyReviewCompleted") continue;
    const kd = d[field.key];
    if (kd?.na) {
      lines.push({ label: `${field.letter}:`, value: "None (cash purchase)" });
      continue;
    }
    if (!kd?.date) continue;
    const amount = field.key === "initialDeposit" ? f.initialDeposit : field.key === "secondDeposit" ? f.additionalDeposit : "";
    const rule = ruleText(kd);
    lines.push({ label: `${field.letter}${amount ? ` (${amount})` : ""}:`, value: `${usDate(kd.date)}${rule ? ` (${rule})` : ""}` });
  }
  lines.push({ text: "Please note these dates in your calendar. Should you have any questions, please do not hesitate to contact this office." });
  return lines;
}

export async function buildContingencyLetter(state: KeyDatesState, opts: { ourRef: string; date: string; dear?: string }): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(path.join(process.cwd(), "src", "templates", "contingency-dates-letter.docx")));
  const files = unzipSync(bytes);
  const f = state.facts ?? {};
  const values: Record<string, string> = {
    YOUR_REF: (f.property ?? "").split(",")[0].trim(),
    OUR_REF: opts.ourRef,
    DATE: opts.date,
    RE_LINE: `Re: ${f.property || "Contract of Sale"}${f.buyers?.length && f.sellers?.length ? ` – ${f.sellers.join(" & ")} to ${f.buyers.join(" & ")}` : ""}`,
    DEAR: opts.dear || "All Parties",
  };

  let xml = strFromU8(files["word/document.xml"]);
  // {{BODY}} becomes one paragraph per line, in the template paragraph's own formatting.
  xml = xml.replace(/<w:p>((?:(?!<w:p>)[\s\S])*?)\{\{BODY\}\}((?:(?!<w:p>)[\s\S])*?)<\/w:p>/, (whole) => {
    const pPr = whole.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const rPr = whole.match(/<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? "";
    const bold = rPr ? rPr.replace("<w:rPr>", "<w:rPr><w:b/>") : "<w:rPr><w:b/></w:rPr>";
    const run = (t: string, props: string) => `<w:r>${props}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    const empty = `<w:p>${pPr}</w:p>`;
    return letterLines(state)
      .map((l, i) => {
        if ("text" in l) return `${empty}<w:p>${pPr}${run(l.text, rPr)}</w:p>${i === 0 ? empty : ""}`;
        return `<w:p>${pPr}${run(`${l.label} `, bold)}${run(l.value, rPr)}</w:p>`;
      })
      .join("");
  });
  xml = xml.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, key: string) => esc(values[key] ?? ""));
  files["word/document.xml"] = strToU8(xml);
  return zipSync(files, { level: 6 });
}
