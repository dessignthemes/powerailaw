import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The deployed version (Vercel's commit), so open tabs can tell when they're out of date.
export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev";
  return NextResponse.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
