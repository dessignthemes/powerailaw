import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET, AccessError } from "@/lib/data/documents";
import { type AiCtx, type PendingAction, assertMatter } from "@/lib/ai/store";
import { schemas } from "@/lib/ai/tools";

export type ActionResult = { recordId: string; label: string; href: string };

const UNIQUE_VIOLATION = "23505";

// Executes a confirmed action. Every insert uses the id reserved when the
// proposal was made (target_id), so a retry can only ever hit the same row.
export async function executeAction(ctx: AiCtx, a: PendingAction): Promise<ActionResult> {
  const s = createAdminClient();
  // Re-validate the stored arguments with the same schema the tool used.
  const parsed = schemas[a.tool].safeParse(a.args);
  if (!parsed.success) throw new AccessError(403, "This proposal is no longer valid.");
  if (a.matter_id) await assertMatter(ctx, a.matter_id);

  if (a.tool === "createClient") {
    const v = parsed.data as { name: string; type?: string; email?: string; phone?: string; address?: string; description?: string };
    const { error } = await s.from("clients").insert({
      id: a.target_id,
      org_id: ctx.orgId,
      name: v.name,
      type: v.type ?? "Individual",
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: v.address ?? null,
      description: v.description ?? "",
      status: "Active",
    });
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
    return { recordId: a.target_id, label: v.name, href: `/dashboard/clients?open=${a.target_id}` };
  }

  if (a.tool === "createTask") {
    const v = parsed.data as { title: string; description?: string; priority?: string; dueDate?: string; assignee?: string };
    const { error } = await s.from("tasks").insert({
      id: a.target_id,
      org_id: ctx.orgId,
      matter_id: a.matter_id,
      title: v.title,
      description: v.description ?? "",
      status: "todo",
      priority: v.priority ?? "Medium",
      due_date: v.dueDate ?? null,
      assignee: v.assignee ?? null,
      created_by: ctx.userId,
    });
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
    return { recordId: a.target_id, label: v.title, href: `/dashboard/task-board?task=${a.target_id}` };
  }

  // saveDocumentDraft → PDF on the matter (document id = target_id)
  if (!a.matter_id) throw new AccessError(403, "Drafts must be saved to a matter.");
  const v = parsed.data as { title: string; content: string };
  const { data: existing } = await s.from("documents").select("id").eq("id", a.target_id).maybeSingle();
  if (!existing) {
    const bytes = await draftPdf(v.title, v.content);
    const path = `${ctx.orgId}/${a.matter_id}/${a.target_id}.pdf`;
    const up = await s.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) throw up.error;
    const title = /\.pdf$/i.test(v.title) ? v.title : `${v.title} (draft).pdf`;
    const { error: dErr } = await s
      .from("documents")
      .insert({ id: a.target_id, org_id: ctx.orgId, matter_id: a.matter_id, title, created_by: ctx.userId });
    if (dErr && dErr.code !== UNIQUE_VIOLATION) throw dErr;
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    const { error: vErr } = await s.from("document_versions").insert({
      org_id: ctx.orgId,
      document_id: a.target_id,
      version_number: 1,
      storage_path: path,
      size_bytes: bytes.byteLength,
      page_count: pages,
      has_form_fields: false,
      note: "AI-generated draft for attorney review",
      created_by: ctx.userId,
      created_by_email: ctx.email,
    });
    if (vErr && vErr.code !== UNIQUE_VIOLATION) throw vErr;
  }
  return { recordId: a.target_id, label: v.title, href: `/dashboard/power-pdf/${a.target_id}` };
}

// The standard PDF font only covers Western European characters; map common
// typographic characters and replace anything else.
function winAnsi(s: string) {
  return s
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[•▪◦]/g, "-")
    .replace(/\t/g, "    ")
    .replace(/[^\x0A\x20-\x7E\u00A1-\u00FF€]/g, "?");
}

export async function draftPdf(title: string, content: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 11;
  const lh = size * 1.45;
  const margin = 64;
  const W = 612;
  const H = 792;
  const maxW = W - margin * 2;
  const banner = "DRAFT - AI-generated for attorney review. Not legal advice.";

  let page = doc.addPage([W, H]);
  let y = H - margin;
  const header = () => {
    page.drawText(banner, { x: margin, y: H - 36, size: 8.5, font: bold, color: rgb(0.62, 0.23, 0.14) });
  };
  header();
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - margin;
    header();
  };

  const wrap = (text: string, f = font, sz = size) => {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/(\s+)/)) {
        const cand = line + word;
        if (line && f.widthOfTextAtSize(cand.trimEnd(), sz) > maxW) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line = cand;
      }
      lines.push(line.trimEnd());
    }
    return lines;
  };

  for (const l of wrap(winAnsi(title), bold, 15)) {
    page.drawText(l, { x: margin, y, size: 15, font: bold });
    y -= 22;
  }
  y -= 8;
  for (const l of wrap(winAnsi(content))) {
    if (y < margin) newPage();
    if (l) page.drawText(l, { x: margin, y, size, font });
    y -= lh;
  }
  return doc.save();
}
