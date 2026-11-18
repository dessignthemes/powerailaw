import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { mergeRecords, MergeError, type MergeKind } from "@/lib/data/merge";

export const dynamic = "force-dynamic";

// POST { kind: "matters" | "clients" | "contacts", keepId, dropId }
export async function POST(request: Request) {
  try {
    const { orgId } = await requireUserOrg();
    const body = (await request.json().catch(() => ({}))) as { kind?: MergeKind; keepId?: string; dropId?: string };
    const result = await mergeRecords(orgId, body.kind as MergeKind, String(body.keepId ?? ""), String(body.dropId ?? ""));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError || error instanceof MergeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/merge failed:", error);
    return NextResponse.json({ error: "The records couldn't be merged. Please try again." }, { status: 500 });
  }
}
