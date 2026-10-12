import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { nextMatterNumber } from "@/lib/data/matters";

export const dynamic = "force-dynamic";

// GET -> { next, year }: preview of the next matter number (the database gives the real one on save).
export async function GET() {
  try {
    return NextResponse.json(await nextMatterNumber());
  } catch (error) {
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GET /api/matters/next-number failed:", error);
    return NextResponse.json({ error: "Couldn't work out the next matter number." }, { status: 500 });
  }
}
