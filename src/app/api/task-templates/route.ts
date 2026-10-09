import { NextResponse } from "next/server";
import { listTemplates, createTemplate, templateError } from "@/lib/data/taskTemplates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (e) {
    return templateError("GET /api/task-templates", e);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; sections?: unknown };
    return NextResponse.json({ template: await createTemplate(body) }, { status: 201 });
  } catch (e) {
    return templateError("POST /api/task-templates", e);
  }
}
