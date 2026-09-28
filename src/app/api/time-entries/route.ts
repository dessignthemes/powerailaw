import { NextResponse } from "next/server";
import { listTimeEntries, createTimeEntry } from "@/lib/data/timeEntries";
import { timeError } from "@/lib/data/timeApi";

export const dynamic = "force-dynamic";

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&everyone=1&task=<id>
export async function GET(request: Request) {
  try {
    const u = new URL(request.url).searchParams;
    return NextResponse.json({
      entries: await listTimeEntries({ from: u.get("from"), to: u.get("to"), everyone: u.get("everyone") === "1", taskId: u.get("task") }),
    });
  } catch (e) {
    return timeError("GET /api/time-entries", e);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ entry: await createTimeEntry(body) }, { status: 201 });
  } catch (e) {
    return timeError("POST /api/time-entries", e);
  }
}
