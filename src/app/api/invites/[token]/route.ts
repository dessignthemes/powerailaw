import { NextResponse } from "next/server";
import { previewInvite, acceptInvite } from "@/lib/data/team";
import { teamError } from "@/lib/data/teamApi";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ token: string }> };

export async function GET(_r: Request, { params }: P) {
  try {
    const { token } = await params;
    return NextResponse.json(await previewInvite(token));
  } catch (e) {
    return teamError("GET /api/invites/[token]", e);
  }
}

export async function POST(_r: Request, { params }: P) {
  try {
    const { token } = await params;
    return NextResponse.json(await acceptInvite(token));
  } catch (e) {
    return teamError("POST /api/invites/[token]", e);
  }
}
