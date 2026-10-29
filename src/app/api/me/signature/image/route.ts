import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };
const MAX = 2 * 1024 * 1024;

// POST (form field "file") → { url } — a picture for the email signature (a logo).
// Served from lawpower.ai so it shows in the recipients' mail.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a picture to add." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG or GIF picture (those show in every mail app)." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "That picture is over 2 MB. Use a smaller one (a logo is usually under 200 KB)." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the file really is that kind of picture.
  const sig = Array.from(bytes.slice(0, 4)).map((n) => n.toString(16).padStart(2, "0")).join("");
  const real = sig.startsWith("89504e47") ? "png" : sig.startsWith("ffd8ff") ? "jpg" : sig.startsWith("47494638") ? "gif" : null;
  if (real !== ext) return NextResponse.json({ error: "That file isn't a PNG, JPG or GIF picture." }, { status: 400 });
  const name = `${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
  const { error } = await createAdminClient().storage.from("email-signatures").upload(`${user.id}/${name}`, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "Couldn't upload the picture. The database needs migration 0056 first." }, { status: 500 });
  return NextResponse.json({ url: `${APP_URL}/api/public/signature-image/${user.id}.${name}` });
}
