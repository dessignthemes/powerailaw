import { NextResponse } from "next/server";
import { receiptSignedUrls } from "@/lib/data/accounting";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";

// POST { paths } — short-lived links to view or package receipts
export async function POST(request: Request) {
  try {
    const b = (await request.json().catch(() => ({}))) as { paths?: unknown };
    const paths = Array.isArray(b.paths) ? b.paths.filter((p): p is string => typeof p === "string") : [];
    return NextResponse.json({ urls: await receiptSignedUrls(paths) });
  } catch (error) {
    return acctFail("POST /api/accounting/receipt/urls", error);
  }
}
