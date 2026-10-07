import { NextResponse } from "next/server";
import { createRequest, listRequests, SignError, AccessError } from "@/lib/esign/server";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";

function fail(where: string, error: unknown) {
  if (error instanceof SignError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof AccessError || error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`${where} failed:`, error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await listRequests());
  } catch (error) {
    return fail("GET /api/esign", error);
  }
}

// POST { documentId, versionId?, signerName, signerEmail, message, fields, expiresInDays }
export async function POST(request: Request) {
  try {
    const b = await request.json();
    const { request: req, token } = await createRequest(b);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ request: req, link: `${origin}/sign/${token}` }, { status: 201 });
  } catch (error) {
    return fail("POST /api/esign", error);
  }
}
