import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { generateTemplate, templateFromText, editTemplate, fillFromMatter, AiTemplateError } from "@/lib/ai/docTemplates";
import { cleanFields } from "@/lib/docTemplates/format";
import { failTemplate } from "@/lib/docTemplates/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST { action: "generate" | "from_text" | "edit" | "fill", ... } — the AI side of AI Templates.
export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    switch (b.action) {
      case "generate":
        return NextResponse.json(await generateTemplate(ctx, { prompt: str(b.prompt), category: str(b.category) || undefined, state: str(b.state) || undefined }));
      case "from_text":
        return NextResponse.json(await templateFromText(ctx, { text: str(b.text), name: str(b.name) || undefined }));
      case "edit":
        return NextResponse.json(await editTemplate(ctx, { body: str(b.body), fields: cleanFields(b.fields), instruction: str(b.instruction), name: str(b.name) || undefined }));
      case "fill": {
        const matterId = str(b.matterId);
        if (!/^[0-9a-f-]{36}$/i.test(matterId)) throw new AiTemplateError("Pick a matter first.");
        return NextResponse.json(await fillFromMatter(ctx, { body: str(b.body), fields: cleanFields(b.fields), matterId }));
      }
      default:
        throw new AiTemplateError("Unknown action.");
    }
  } catch (e) {
    if (e instanceof AiTemplateError) return NextResponse.json({ error: e.message }, { status: e.status });
    return failTemplate("POST /api/doc-templates/ai", e);
  }
}
