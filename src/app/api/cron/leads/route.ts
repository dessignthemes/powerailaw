import { NextResponse } from "next/server";
import { runLeadAutomation } from "@/lib/data/leadAutomation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Hourly: follow-up emails to leads who haven't booked, and reminders before consultations.
// Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const url = new URL(request.url);
  const got = request.headers.get("authorization") ?? `Bearer ${url.searchParams.get("secret") ?? ""}`;
  if (!secret || got !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  return NextResponse.json(await runLeadAutomation());
}
