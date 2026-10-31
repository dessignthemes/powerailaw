import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { failTemplate } from "@/lib/docTemplates/api";
import { DocTemplateError } from "@/lib/data/docTemplates";
import { draftParagraphs, saveFromMaker, startFromTemplate, startFromUpload } from "@/lib/data/templateMaker";
import { aiSuggestions } from "@/lib/docTemplates/aiSuggest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Template maker.
// POST multipart { file: .docx }            → start from the firm's Word file: { draftPath, paragraphs, suggestions }
// POST { action: "open", templateId }       → keep working on a saved Word template
// POST { action: "suggest", draftPath }     → AI suggestions (uses AI credits)
// POST { action: "save", draftPath, templateId?, name, category, description, replacements, blocks, fields, note } → { id, version }
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new DocTemplateError("Choose a Word file (.docx).");
      if (!/\.docx$/i.test(file.name)) throw new DocTemplateError("The template maker works with Word files (.docx), which keep their formatting. For a PDF, use Upload a file (text template) instead, or open the PDF in Word and save it as .docx first.");
      if (file.size > 15 * 1024 * 1024) throw new DocTemplateError("Files must be 15 MB or smaller.");
      return NextResponse.json(await startFromUpload(ctx, new Uint8Array(await file.arrayBuffer())));
    }
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "open" && typeof b.templateId === "string") return NextResponse.json(await startFromTemplate(ctx, b.templateId));
    if (b.action === "suggest") {
      try {
        return NextResponse.json({ suggestions: await aiSuggestions(ctx, await draftParagraphs(ctx.orgId, b.draftPath)) });
      } catch (e) {
        if (e instanceof DocTemplateError) throw e;
        throw new DocTemplateError(e instanceof SyntaxError ? "The AI's answer couldn't be read. Please try again." : (e as Error).message);
      }
    }
    if (b.action === "save") return NextResponse.json(await saveFromMaker(ctx, b));
    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    return failTemplate("POST /api/doc-templates/maker", e);
  }
}
