import { NextResponse } from "next/server";
import { getAiCtx, fileDownloadUrl, deleteFile } from "@/lib/ai/store";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function GET(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    return NextResponse.json({ url: await fileDownloadUrl(ctx, id) });
  } catch (e) {
    return aiError("GET /api/ai/files/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    const ctx = await getAiCtx();
    await deleteFile(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiError("DELETE /api/ai/files/[id]", e);
  }
}
