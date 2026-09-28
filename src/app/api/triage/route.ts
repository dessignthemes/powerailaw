import { NextResponse } from "next/server";
import { getTriage } from "@/lib/data/triage";
import { triageError } from "@/lib/data/triageApi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTriage());
  } catch (e) {
    return triageError("GET /api/triage", e);
  }
}
