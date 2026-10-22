import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { listDocTemplates, createDocTemplate, DocTemplateError } from "@/lib/data/docTemplates";
import { SAMPLE_TEMPLATES } from "@/lib/docTemplates/samples";
import { failTemplate } from "@/lib/docTemplates/api";

export const dynamic = "force-dynamic";


// GET → the firm's templates plus the built-in samples. POST → save a new template.
export async function GET() {
  try {
    const ctx = await getAiCtx();
    let mine: Awaited<ReturnType<typeof listDocTemplates>> = [];
    let setupRequired = false;
    try {
      mine = await listDocTemplates(ctx.orgId);
    } catch (e) {
      if (e instanceof DocTemplateError && e.code === "setup_required") setupRequired = true;
      else throw e;
    }
    return NextResponse.json({ templates: mine, samples: SAMPLE_TEMPLATES, setupRequired });
  } catch (e) {
    return failTemplate("GET /api/doc-templates", e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAiCtx();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ template: await createDocTemplate(ctx.orgId, ctx.userId, body) }, { status: 201 });
  } catch (e) {
    return failTemplate("POST /api/doc-templates", e);
  }
}
