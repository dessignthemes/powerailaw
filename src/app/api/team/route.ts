import { NextResponse } from "next/server";
import { getTeam } from "@/lib/data/team";
import { teamError } from "@/lib/data/teamApi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTeam());
  } catch (e) {
    return teamError("GET /api/team", e);
  }
}
