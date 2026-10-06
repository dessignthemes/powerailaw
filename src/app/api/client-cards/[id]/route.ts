import { NextResponse } from "next/server";
import { getCard, saveCard, cardFail } from "@/lib/data/clientCards";
import { getSessionUser } from "@/lib/auth";
import { templatesAllowed } from "@/lib/clients/templates";


export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [card, user] = await Promise.all([getCard(id), getSessionUser()]);
    return NextResponse.json({ card, templates: templatesAllowed(user?.email) });
  } catch (error) {
    return cardFail("GET /api/client-cards/[id]", error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ card: await saveCard(id, await request.json()) });
  } catch (error) {
    return cardFail("PUT /api/client-cards/[id]", error);
  }
}
