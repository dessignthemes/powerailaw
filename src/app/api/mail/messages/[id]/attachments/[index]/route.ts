import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/mail/tokens";
import { getGmailAttachment } from "@/lib/mail/google";
import { getOutlookAttachment } from "@/lib/mail/microsoft";
import { requireUserId, parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

// Types the browser may show inside LawPower. Everything else is downloaded,
// never opened in the page (an attachment could be a web page with scripts).
const INLINE = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i;

function mimeFor(name: string, given: string) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", txt: "text/plain" };
  return byExt[ext] ?? (given || "application/octet-stream");
}

// GET ?provider=microsoft|google[&download=1] — one attachment of an email in
// the signed-in person's own mailbox: shown in the page (PDF, image, text) or downloaded.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id, index } = await params;
    const url = new URL(request.url);
    const provider = parseProvider(url.searchParams.get("provider"));
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i > 200) return NextResponse.json({ error: "Unknown attachment." }, { status: 400 });

    const { token } = await getAccessToken(userId, provider);
    const messageId = decodeURIComponent(id).slice(0, 500);
    const att = provider === "google" ? await getGmailAttachment(token, messageId, i) : await getOutlookAttachment(token, messageId, i);
    const mime = mimeFor(att.name, att.mimeType);
    const inline = INLINE.test(mime) && url.searchParams.get("download") !== "1";
    const safeName = att.name.replace(/["\\\r\n]/g, "_").slice(0, 200) || "attachment";
    return new NextResponse(Buffer.from(att.bytes), {
      headers: {
        "Content-Type": inline ? mime : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(att.name.slice(0, 200))}`,
        // A sandbox stops the built-in PDF viewer, so PDFs (shown by the browser's own
        // viewer, no scripts of ours) skip it; everything else is locked down.
        ...(mime === "application/pdf" && inline ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" }),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return mailErrorResponse("GET /api/mail/messages/[id]/attachments/[index]", error);
  }
}
