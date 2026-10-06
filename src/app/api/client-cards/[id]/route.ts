import { NextResponse } from "next/server";
import { getCard, saveCard, cardFail } from "@/lib/data/clientCards";


export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ card: await getCard(id) });
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
