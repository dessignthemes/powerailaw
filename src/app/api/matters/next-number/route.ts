import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { nextMatterNumber, matterNumberTaken } from "@/lib/data/matters";

export const dynamic = "force-dynamic";

// GET -> { next, year }: the next matter number (continues after the highest one,
// imported numbers included). GET ?check=REP-2026-3709 -> { taken }: whether a
// number someone wants to type in is already used.
export async function GET(request: Request) {
  try {
    const check = new URL(request.url).searchParams.get("check");
    if (check) return NextResponse.json({ taken: await matterNumberTaken(check, new URL(request.url).searchParams.get("except")) });
    return NextResponse.json(await nextMatterNumber());
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GET /api/matters/next-number failed:", error);
    return NextResponse.json({ error: "Couldn't work out the next matter number." }, { status: 500 });
  }
}
