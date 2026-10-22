import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET → { enabled } ; PATCH { enabled } — the signed-in person's 9 AM check-in email.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data } = await createAdminClient().from("profiles").select("daily_digest").eq("id", user.id).maybeSingle();
  return NextResponse.json({ enabled: (data as { daily_digest?: boolean } | null)?.daily_digest !== false });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  const { error } = await createAdminClient().from("profiles").update({ daily_digest: b.enabled !== false }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save that. The database may need migration 0050." }, { status: 500 });
  return NextResponse.json({ enabled: b.enabled !== false });
}
