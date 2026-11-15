import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { rcStatus, disconnect } from "@/lib/ringcentral";

export const dynamic = "force-dynamic";

// GET → { configured, connected, fromNumber, account } for the signed-in person.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  return NextResponse.json(await rcStatus(user.id).catch(() => ({ configured: false, connected: false })));
}

// DELETE → disconnect RingCentral for the signed-in person.
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  await disconnect(user.id);
  return NextResponse.json({ ok: true });
}
