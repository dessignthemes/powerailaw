import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanSignatureHtml, getSignature, SIGNATURE_MAX } from "@/lib/mail/signature";

export const dynamic = "force-dynamic";

// GET → { on, html, ready } ; PUT { on?, html? } — the signed-in person's email signature.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  return NextResponse.json(await getSignature(user.id));
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { on?: unknown; html?: unknown };
  const patch: { email_signature_html?: string | null; email_signature_on?: boolean } = {};
  if (b.html !== undefined) {
    const raw = String(b.html ?? "");
    if (raw.length > SIGNATURE_MAX) return NextResponse.json({ error: "The signature is too long. Remove some of it." }, { status: 400 });
    patch.email_signature_html = cleanSignatureHtml(raw) || null;
  }
  if (b.on !== undefined) patch.email_signature_on = b.on !== false;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const { error } = await createAdminClient().from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Couldn't save the signature. The database needs migration 0056 first." }, { status: 500 });
  return NextResponse.json(await getSignature(user.id));
}
