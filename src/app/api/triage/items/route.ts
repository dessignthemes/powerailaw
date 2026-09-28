import { NextResponse } from "next/server";
import { markTriaged, unmarkTriaged } from "@/lib/data/triage";
import { triageError } from "@/lib/data/triageApi";

export const dynamic = "force-dynamic";

// POST { provider, messageId, status: "task" | "dismissed", taskId? }
export async function POST(request: Request) {
  try {
    await markTriaged(await request.json().catch(() => ({})));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return triageError("POST /api/triage/items", e);
  }
}

// DELETE ?provider=…&messageId=… — show the email in Triage again
export async function DELETE(request: Request) {
  try {
    const u = new URL(request.url).searchParams;
    await unmarkTriaged(u.get("provider"), u.get("messageId"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return triageError("DELETE /api/triage/items", e);
  }
}
