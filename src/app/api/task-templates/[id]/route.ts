import { NextResponse } from "next/server";
import { updateTemplate, deleteTemplate, templateError } from "@/lib/data/taskTemplates";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; sections?: unknown };
    return NextResponse.json({ template: await updateTemplate(id, body) });
  } catch (e) {
    return templateError("PATCH /api/task-templates/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return templateError("DELETE /api/task-templates/[id]", e);
  }
}
