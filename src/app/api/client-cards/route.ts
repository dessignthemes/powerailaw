import { NextResponse } from "next/server";
import { listCards, saveCard, cardFail } from "@/lib/data/clientCards";

export const dynamic = "force-dynamic";


export async function GET() {
  try {
    return NextResponse.json({ cards: await listCards() });
  } catch (error) {
    return cardFail("GET /api/client-cards", error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json({ card: await saveCard(null, await request.json()) }, { status: 201 });
  } catch (error) {
    return cardFail("POST /api/client-cards", error);
  }
}
