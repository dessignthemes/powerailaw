import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { failTemplate } from "@/lib/docTemplates/api";
import { listVersions, restoreVersion } from "@/lib/data/templateMaker";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };

// GET → { versions } (newest first: who saved, when, note). POST { restore: n } → roll back to version n (saved as a new version).
export async function GET(_r: Request, { params }: P) {
  try {
    const ctx = await getAiCtx();
    const { id } = await params;
    return NextResponse.json({ versions: await listVersions(ctx.orgId, id) });
  } catch (e) {
    return failTemplate("GET /api/doc-templates/[id]/versions", e);
  }
}

export async function POST(request: Request, { params }: P) {
  try {
    const ctx = await getAiCtx();
    const { id } = await params;
    const b = (await request.json().catch(() => ({}))) as { restore?: unknown };
    return NextResponse.json(await restoreVersion(ctx, id, Math.floor(Number(b.restore))));
  } catch (e) {
    return failTemplate("POST /api/doc-templates/[id]/versions", e);
  }
}
