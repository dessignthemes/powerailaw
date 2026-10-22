import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDocumentFromUpload, newStoragePath, DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { FILE_TYPES } from "@/lib/documents/fileTypes";
import { fillBody } from "@/lib/docTemplates/format";
import { templateToDocx } from "@/lib/docTemplates/docx";
import { failTemplate } from "@/lib/docTemplates/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { body, values, title, matterId?, templateName? } → a Word document.
// With a matter: saved to that matter's Documents (returns documentId); without:
// returned as a file to download (base64).
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const b = (await request.json().catch(() => ({}))) as { body?: unknown; values?: unknown; title?: unknown; matterId?: unknown; templateName?: unknown };
    const body = typeof b.body === "string" ? b.body : "";
    if (!body.trim()) return NextResponse.json({ error: "The template is empty." }, { status: 400 });
    const values: Record<string, string> = {};
    if (b.values && typeof b.values === "object") for (const [k, v] of Object.entries(b.values as Record<string, unknown>)) values[k] = typeof v === "string" ? v.slice(0, 4000) : "";
    const filled = fillBody(body, values);
    const bytes = await templateToDocx(filled);
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
