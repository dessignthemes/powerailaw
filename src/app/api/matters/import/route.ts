import { NextResponse } from "next/server";
import { importLeapMatters, ImportError } from "@/lib/matters/importLeapServer";
import { AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // large LEAP files

// POST { rows: LeapRow[] } → creates the matters (LEAP import, Rapciewicz firm only).
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { rows?: unknown };
    return NextResponse.json(await importLeapMatters(body.rows));
  } catch (e) {
    if (e instanceof ImportError || e instanceof AccessError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/matters/import failed:", e);
    return NextResponse.json({ error: "The import didn't finish. Nothing more was created; try again." }, { status: 500 });
  }
}
