import { NextResponse } from "next/server";
import { requireUserOrg } from "@/lib/data/documents";
import { sendSms, RingCentralError } from "@/lib/ringcentral";
import { logMessage, listMatterMessages } from "@/lib/mail/matterMail";

export const dynamic = "force-dynamic";

// POST { matterId, to, text } → sent from the person's RingCentral number and saved to the matter.
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireUserOrg();
    const b = (await request.json().catch(() => ({}))) as { matterId?: string; to?: string; text?: string };
    const sent = await sendSms(user.id, String(b.to ?? ""), String(b.text ?? ""));
    let messages: unknown = null;
    if (b.matterId && /^[0-9a-f-]{36}$/i.test(b.matterId)) {
      await logMessage(orgId, user.id, b.matterId, { channel: "sms", direction: "out", phone: sent.to, body: String(b.text ?? "") });
      messages = await listMatterMessages(orgId, user.id, b.matterId);
    }
    return NextResponse.json({ ok: true, from: sent.from, messages });
  } catch (e) {
    if (e instanceof RingCentralError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/ringcentral/sms failed:", e);
    return NextResponse.json({ error: "The text couldn't be sent. Please try again." }, { status: 500 });
  }
}
