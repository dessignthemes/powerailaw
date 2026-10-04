import { NextResponse } from "next/server";
import { receiptBytes, AcctError } from "@/lib/data/accounting";
import { readReceipt } from "@/lib/accounting/ai";
import { extractText } from "@/lib/ai/extract";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { path } — reads a PDF receipt and suggests vendor, date, amount, category
export async function POST(request: Request) {
  try {
    const b = (await request.json().catch(() => ({}))) as { path?: unknown };
    if (typeof b.path !== "string") throw new AcctError(400, "No receipt to read.");
    if (!b.path.endsWith(".pdf")) return NextResponse.json({ guess: null, reason: "photo" });
    const bytes = await receiptBytes(b.path);
    const ex = await extractText(bytes);
    const text = ex.status === "failed" ? "" : ex.chunks.map((c) => c.content).join("\n");
    if (text.trim().length < 15) return NextResponse.json({ guess: null, reason: "no_text" });
    return NextResponse.json({ guess: await readReceipt(text), reason: null });
  } catch (error) {
    return acctFail("POST /api/accounting/receipt/scan", error);
  }
}
