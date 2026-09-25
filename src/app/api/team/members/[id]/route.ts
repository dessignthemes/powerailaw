import { NextResponse } from "next/server";
import { changeRole, removeMember } from "@/lib/data/team";
import { teamError } from "@/lib/data/teamApi";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const { role } = (await request.json().catch(() => ({}))) as { role?: string };
    await changeRole(id, String(role ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return teamError("PATCH /api/team/members/[id]", e);
  }
}

export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    await removeMember(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return teamError("DELETE /api/team/members/[id]", e);
  }
}
