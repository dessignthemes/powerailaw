import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { messageBody, removeMessage, MatterMailError } from "@/lib/mail/matterMail";
import { mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string; msgId: string }> };
const valid = (...ids: string[]) => ids.every((x) => /^[0-9a-f-]{36}$/i.test(x));

function fail(where: string, error: unknown) {
  if (error instanceof MatterMailError || error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  return mailErrorResponse(where, error);
}

// GET → one message with its full text.
export async function GET(_r: Request, { params }: P) {
  try {
    const { user, orgId } = await requireUserOrg();
    const { id, msgId } = await params;
    if (!valid(id, msgId)) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    return NextResponse.json({ message: await messageBody(orgId, user.id, id, msgId) });
  } catch (error) {
    return fail("GET /api/matters/[id]/messages/[msgId]", error);
  }
}

// DELETE → takes it off the matter (the mailbox is not changed).
export async function DELETE(_r: Request, { params }: P) {
  try {
    const { orgId } = await requireUserOrg();
    const { id, msgId } = await params;
    if (!valid(id, msgId)) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    await removeMessage(orgId, id, msgId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail("DELETE /api/matters/[id]/messages/[msgId]", error);
  }
}
