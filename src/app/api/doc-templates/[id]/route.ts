import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { getDocTemplate, updateDocTemplate, deleteDocTemplate, DocTemplateError } from "@/lib/data/docTemplates";
import { failTemplate } from "@/lib/docTemplates/api";

export const dynamic = "force-dynamic";
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAiCtx();
    const { id } = await params;
    if (!isId(id)) throw new DocTemplateError("That template wasn't found.", 404);
    return NextResponse.json({ template: await getDocTemplate(ctx.orgId, id) });
  } catch (e) {
    return failTemplate("GET /api/doc-templates/[id]", e);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAiCtx();
    const { id } = await params;
    if (!isId(id)) throw new DocTemplateError("That template wasn't found.", 404);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ template: await updateDocTemplate(ctx.orgId, id, body) });
  } catch (e) {
    return failTemplate("PATCH /api/doc-templates/[id]", e);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAiCtx();
    const { id } = await params;
    if (!isId(id)) throw new DocTemplateError("That template wasn't found.", 404);
    await deleteDocTemplate(ctx.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failTemplate("DELETE /api/doc-templates/[id]", e);
  }
}
