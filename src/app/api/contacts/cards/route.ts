import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { importCards, CardsImportError } from "@/lib/data/cardsImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { cards: [...] } — one batch of cards from an Excel / Cards import (sorted in the browser).
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { cards?: unknown };
    const result = await importCards(await getCurrentOrgId(), user.id, body.cards);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CardsImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/contacts/cards failed:", error);
    return NextResponse.json({ error: "The cards couldn't be imported. Please try again." }, { status: 500 });
  }
}
