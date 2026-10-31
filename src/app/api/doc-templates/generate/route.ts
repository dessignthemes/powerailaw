import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDocumentFromUpload, newStoragePath, DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { FILE_TYPES } from "@/lib/documents/fileTypes";
import { fillBody } from "@/lib/docTemplates/format";
import { templateToDocx } from "@/lib/docTemplates/docx";
import { failTemplate } from "@/lib/docTemplates/api";
import { templateFile } from "@/lib/data/templateMaker";
import { fillDocx } from "@/lib/docTemplates/docxTag";
import { DocTemplateError } from "@/lib/data/docTemplates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { body, values, title, matterId?, templateName? } → a Word document.
// With a matter: saved to that matter's Documents (returns documentId); without:
// returned as a file to download (base64).
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const b = (await request.json().catch(() => ({}))) as { body?: unknown; values?: unknown; title?: unknown; matterId?: unknown; templateName?: unknown; templateId?: unknown };
    const body = typeof b.body === "string" ? b.body : "";
    const values: Record<string, string> = {};
    if (b.values && typeof b.values === "object") for (const [k, v] of Object.entries(b.values as Record<string, unknown>)) values[k] = typeof v === "string" ? v.slice(0, 4000) : "";
    // A template made from the firm's own Word file: fill that file (its formatting is kept).
    const word = typeof b.templateId === "string" && /^[0-9a-f-]{36}$/i.test(b.templateId) ? await templateFile(ctx.orgId, b.templateId) : null;
    let bytes: Buffer;
    if (word) {
      const missingRequired = word.fields.filter((f) => f.required && f.type !== "yes_no" && !(values[f.key] ?? f.default ?? "").trim());
      if (missingRequired.length) throw new DocTemplateError(`Fill in: ${missingRequired.map((f) => f.label).join(", ")}.`);
      const shown: Record<string, string> = {};
      for (const f of word.fields) shown[f.key] = formatValue(values[f.key]?.trim() ? values[f.key] : f.default ?? "", f.type);
      try {
        bytes = Buffer.from(await fillDocx(word.bytes, shown, word.fields.filter((f) => f.type === "yes_no").map((f) => f.key)));
      } catch (e) {
        throw new DocTemplateError((e as Error).message);
      }
    } else {
      if (!body.trim()) return NextResponse.json({ error: "The template is empty." }, { status: 400 });
      bytes = await templateToDocx(fillBody(body, values));
    }
    const title = (typeof b.title === "string" && b.title.trim() ? b.title.trim() : typeof b.templateName === "string" ? b.templateName : "Document").slice(0, 150);
    const fileName = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim()}.docx`;

    const matterId = typeof b.matterId === "string" && /^[0-9a-f-]{36}$/i.test(b.matterId) ? b.matterId : null;
    if (!matterId) return NextResponse.json({ fileName, base64: bytes.toString("base64") });

    const path = newStoragePath(ctx.orgId, matterId, "docx");
    const up = await createAdminClient().storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: FILE_TYPES.docx.mime, upsert: false });
    if (up.error) throw up.error;
    const doc = await createDocumentFromUpload({
      orgId: ctx.orgId,
      matterId,
      userId: ctx.userId,
      userEmail: ctx.email,
      title: fileName,
      path,
      note: `Created from template: ${typeof b.templateName === "string" ? b.templateName.slice(0, 120) : "AI Templates"}`,
    });
    return NextResponse.json({ fileName, documentId: doc.id, versionId: doc.versions[0]?.id ?? null, base64: bytes.toString("base64") });
  } catch (e) {
    return failTemplate("POST /api/doc-templates/generate", e);
  }
}

// Dates as "November 3, 2026"; amounts as "$318,000.00" (typed values are kept as typed otherwise).
function formatValue(v: string, type?: string): string {
  const t = v.trim();
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
  if (type === "currency" && /^\$?\s*[\d,]+(\.\d+)?$/.test(t)) {
    const n = Number(t.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n)) return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  return v;
}
