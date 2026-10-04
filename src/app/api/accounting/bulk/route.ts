import { NextResponse } from "next/server";
import { bulkUpdate, AcctError } from "@/lib/data/accounting";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";

// POST { ids: string[], patch: {...} } — e.g. approve many at once
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown; patch?: unknown };
    if (!Array.isArray(body.ids) || !body.ids.every((x) => typeof x === "string")) throw new AcctError(400, "Nothing selected.");
    return NextResponse.json({ updated: await bulkUpdate(body.ids as string[], body.patch ?? {}) });
  } catch (error) {
    return acctFail("POST /api/accounting/bulk", error);
  }
}
