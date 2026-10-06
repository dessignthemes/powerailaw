import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCard, cardFail } from "@/lib/data/clientCards";
import { fillTemplate, intakeValues, engagementValues, templatesAllowed } from "@/lib/clients/templates";

export const dynamic = "force-dynamic";

// POST { kind: "intake" } or { kind: "engagement", ourRef, yourRef, date, dear, description }
// → the firm's Word document filled in with this client's card.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!templatesAllowed(user.email)) return NextResponse.json({ error: "Document templates aren't set up for your firm yet." }, { status: 403 });
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (k: string, max = 500) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
    const card = await getCard(id);
    let bytes: Uint8Array;
    let filename: string;
    const name = (card.cardType === "company" ? card.profile.company.name : card.profile.people[0].last || card.profile.people[0].first || "Client").replace(/[^\w .-]+/g, "");
    if (body.kind === "engagement") {
      if (!str("description")) return NextResponse.json({ error: "Describe the matter (for example the property address)." }, { status: 400 });
      bytes = await fillTemplate(
        "engagement",
        engagementValues(card.cardType, card.profile, { ourRef: str("ourRef", 80), yourRef: str("yourRef", 200), date: str("date", 40), dear: str("dear", 200), description: str("description", 400) })
      );
      filename = `Engagement Agreement - ${name}.docx`;
    } else {
      bytes = await fillTemplate("intake", intakeValues(card.cardType, card.profile));
      filename = `Client Intake Sheet - ${name}.docx`;
    }
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return cardFail("POST /api/client-cards/[id]/document", error);
  }
}
