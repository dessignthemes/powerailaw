import { NextResponse } from "next/server";
import { requireUserOrg, AccessError } from "@/lib/data/documents";
import { saveAttachmentsToMatter, MatterMailError } from "@/lib/mail/matterMail";
import { parseProvider, mailErrorResponse } from "@/lib/mail/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { provider, matterId, picks: [{ index, name }] } → those attachments are saved
// to the matter's Documents (under the names given). The email itself isn't filed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, orgId } = await requireUserOrg();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { provider?: string; matterId?: unknown; picks?: unknown };
    const provider = parseProvider(body.provider ?? null);
    if (!provider) return NextResponse.json({ error: "Unknown mail provider." }, { status: 400 });
    if (typeof body.matterId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.matterId)) return NextResponse.json({ error: "Pick the matter." }, { status: 400 });
    const picks = (Array.isArray(body.picks) ? body.picks : [])
      .slice(0, 50)
      .map((p) => p as { index?: unknown; name?: unknown })
      .filter((p) => Number.isInteger(p.index))
      .map((p) => ({ index: Number(p.index), name: typeof p.name === "string" ? p.name.slice(0, 200) : "" }));
    const result = await saveAttachmentsToMatter(orgId, user.id, provider, decodeURIComponent(id).slice(0, 500), body.matterId, picks);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MatterMailError || error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return mailErrorResponse("POST /api/mail/messages/[id]/attachments/save", error);
  }
}
