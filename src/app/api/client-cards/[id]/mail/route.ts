import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCard, cardFail } from "@/lib/data/clientCards";
import { searchMail } from "@/lib/ai/workspaceTools";


export const dynamic = "force-dynamic";

// GET — recent emails to or from this client's email addresses, from the
// signed-in person's own connected mailbox (read-only).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await params;
    const card = await getCard(id);
    const lines = card.cardType === "company" ? card.profile.company.contacts : card.profile.people.flatMap((p) => p.contacts);
    const emails = [...new Set(lines.filter((l) => l.kind === "Email" && /@/.test(l.value)).map((l) => l.value.trim().toLowerCase()))].slice(0, 3);
    if (!emails.length) return NextResponse.json({ emails: [], messages: [], note: "Add an email address to this card to see mail with this client." });
    const all: Record<string, unknown>[] = [];
    let problem: string | undefined;
    for (const e of emails) {
      const res = await searchMail(user.id, e, 25);
      if ("error" in res) problem = String(res.error);
      else all.push(...res.results);
    }
    const seen = new Set<string>();
    const messages = all
      .filter((m) => (seen.has(String(m.id)) ? false : (seen.add(String(m.id)), true)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 40);
    return NextResponse.json({ emails, messages, note: messages.length ? undefined : problem });
  } catch (error) {
    return cardFail("GET /api/client-cards/[id]/mail", error);
  }
}
