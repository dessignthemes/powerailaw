import { NextResponse } from "next/server";
import { sendMorningDigests } from "@/lib/email/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The morning check-in. Vercel runs this at 13:00 and 14:00 UTC (so one of
// them is 9 AM Eastern all year); the sender itself only emails firms where
// it's 9 AM right now. ?force=1 sends regardless of the hour (testing);
// &email= limits it to one person. Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const url = new URL(request.url);
  const got = request.headers.get("authorization") ?? `Bearer ${url.searchParams.get("secret") ?? ""}`;
  if (!secret || got !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const result = await sendMorningDigests({ force: url.searchParams.get("force") === "1", onlyEmail: url.searchParams.get("email") ?? undefined });
  return NextResponse.json(result);
}
