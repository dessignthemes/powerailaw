import { NextResponse } from "next/server";
import { syncAllOutlookContacts } from "@/lib/data/contactImport";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily: brings in new Outlook contacts for everyone who turned on "keep in step"
// (Contacts also catches up whenever someone opens it).
// Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = request.headers.get("authorization") ?? "";
  if (!secret || got !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  return NextResponse.json(await syncAllOutlookContacts());
}
