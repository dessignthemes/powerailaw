import { NextResponse } from "next/server";
import { createInvite } from "@/lib/data/team";
import { teamError } from "@/lib/data/teamApi";

export const dynamic = "force-dynamic";

// The invite link is only returned here (and when regenerated); the server
// keeps just its hash.
export async function POST(request: Request) {
  try {
    const { email, role } = (await request.json()) as { email?: string; role?: string };
    const { invite, token } = await createInvite(String(email ?? ""), String(role ?? "member"));
    const origin = new URL(request.url).origin;
    return NextResponse.json({ invite, link: `${origin}/invite/${token}` }, { status: 201 });
  } catch (e) {
    return teamError("POST /api/team/invites", e);
  }
}
