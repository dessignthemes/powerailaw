import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { listFollowUps, updateFollowUp } from "@/lib/data/mailFollowups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET → the signed-in person's email follow-up reminders.
export async function GET() {
  try {
    const { user, orgId } = await requireUserOrg();
    return NextResponse.json(await listFollowUps(orgId, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/mail/followups failed:", e);
    return NextResponse.json({ error: "The follow-up reminders couldn't be loaded." }, { status: 500 });
  }
}

// PATCH { id, action: "done" | "dismiss" | "snooze" | "reopen" }
export async function PATCH(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
    if (typeof b.id !== "string" || typeof b.action !== "string") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    const item = await updateFollowUp(orgId, user.id, b.id, b.action);
    if (!item) return NextResponse.json({ error: "That reminder wasn't found." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("PATCH /api/mail/followups failed:", e);
    return NextResponse.json({ error: "The reminder couldn't be changed." }, { status: 500 });
  }
}
