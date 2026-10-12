import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { listMatterMessages, syncMatterEmails, logMessage, MatterMailError } from "@/lib/mail/matterMail";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type P = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function fail(where: string, error: unknown) {
  if (error instanceof MatterMailError || error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  return mailErrorResponse(where, error);
}

// GET ?sync=1 → the matter's emails and texts; with sync, the person's mailbox
// is checked first for emails carrying the matter number or in its threads.
export async function GET(request: Request, { params }: P) {
  try {
    const { user, orgId } = await requireUserOrg();
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    let sync: { added: number; checked: string[] } | null = null;
    let syncError: string | null = null;
    if (new URL(request.url).searchParams.get("sync") === "1") {
      try {
        sync = await syncMatterEmails(orgId, user.id, id);
      } catch (e) {
        if (e instanceof MatterMailError) throw e;
        console.error("Matter email check failed:", e);
        syncError = (e as Error)?.message && /reconnect|access|connect/i.test((e as Error).message) ? (e as Error).message : "Your mailbox couldn't be checked just now.";
      }
    }
    return NextResponse.json({ messages: await listMatterMessages(orgId, user.id, id), sync, syncError });
  } catch (error) {
    return fail("GET /api/matters/[id]/messages", error);
  }
}

// POST { channel: "sms", direction, phone, body, sentAt } logs a text message.
export async function POST(request: Request, { params }: P) {
  try {
    const { user, orgId } = await requireUserOrg();
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ error: "Matter not found." }, { status: 404 });
    await logMessage(orgId, user.id, id, (await request.json().catch(() => ({}))) as Record<string, unknown>);
    return NextResponse.json({ messages: await listMatterMessages(orgId, user.id, id) }, { status: 201 });
  } catch (error) {
    return fail("POST /api/matters/[id]/messages", error);
  }
}
