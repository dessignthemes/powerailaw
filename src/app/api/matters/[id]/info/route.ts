import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { getMatterInfo, saveMatterInfo, MatterInfoError } from "@/lib/data/matterInfo";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };
const bad = (id: string) => !/^[0-9a-f-]{36}$/i.test(id);
function fail(where: string, e: unknown) {
  if (e instanceof MatterInfoError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`${where} failed:`, e);
  return NextResponse.json({ error: "Couldn't save. Please try again." }, { status: 500 });
}

// GET → { info, ready } ; PATCH { originatingAttorney?, responsibleStaff?, clientReference?, location?, openDate?, pendingDate?, closedDate?, solDate?, solSatisfied?, trustMinimum? }
export async function GET(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    if (bad(id)) return NextResponse.json({ error: "That matter wasn't found." }, { status: 404 });
    return NextResponse.json(await getMatterInfo(id));
  } catch (e) {
    return fail("GET /api/matters/[id]/info", e);
  }
}

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    if (bad(id)) return NextResponse.json({ error: "That matter wasn't found." }, { status: 404 });
    return NextResponse.json({ info: await saveMatterInfo(id, await request.json().catch(() => ({}))) });
  } catch (e) {
    return fail("PATCH /api/matters/[id]/info", e);
  }
}
