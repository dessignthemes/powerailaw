import { NextResponse } from "next/server";
import { sendMorningDigests } from "@/lib/email/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The morning check-in. Vercel runs this every hour; it only emails firms where
// it's now the hour (and day) chosen in Administration → Email notifications.
// ?force=1 sends regardless of the hour (testing); &email= limits it to one
// person. Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const url = new URL(request.url);
  const got = request.headers.get("authorization") ?? `Bearer ${url.searchParams.get("secret") ?? ""}`;
  if (!secret || got !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const result = await sendMorningDigests({ force: url.searchParams.get("force") === "1", onlyEmail: url.searchParams.get("email") ?? undefined });
  return NextResponse.json(result);
}
