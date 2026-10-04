import { NextResponse } from "next/server";
import { receiptUploadUrl, AcctError } from "@/lib/data/accounting";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";

// POST { fileName, size } — a one-time upload slot for a receipt
export async function POST(request: Request) {
  try {
    const b = (await request.json().catch(() => ({}))) as { fileName?: unknown; size?: unknown };
    if (typeof b.fileName !== "string" || typeof b.size !== "number") throw new AcctError(400, "Choose a receipt file.");
    return NextResponse.json(await receiptUploadUrl(b.fileName, b.size));
  } catch (error) {
    return acctFail("POST /api/accounting/receipt", error);
  }
}
