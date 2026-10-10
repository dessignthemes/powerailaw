import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeExpired } from "@/lib/shares/server";

export const dynamic = "force-dynamic";

// Daily (vercel.json): deletes Secure Files links older than 7 days, and their files.
// Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const ok = secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const n = await purgeExpired();
    total += n;
    if (n < 200) break;
  }
  return NextResponse.json({ purged: total });
}
