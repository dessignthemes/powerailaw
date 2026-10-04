import { NextResponse } from "next/server";
import { listTxns, createTxn, timeSummary, AcctError } from "@/lib/data/accounting";
import { acctFail } from "@/lib/accounting/api";

export const dynamic = "force-dynamic";
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — transactions and billable time
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const from = q.get("from"), to = q.get("to");
    if (!isDate(from) || !isDate(to)) throw new AcctError(400, "Choose a valid period.");
    const [txns, time] = await Promise.all([listTxns(from!, to!), timeSummary(from!, to!)]);
    return NextResponse.json({ txns, time });
  } catch (error) {
    return acctFail("GET /api/accounting", error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json({ txn: await createTxn(await request.json()) }, { status: 201 });
  } catch (error) {
    return acctFail("POST /api/accounting", error);
  }
}
