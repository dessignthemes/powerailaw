import { NextResponse } from "next/server";
import { listContacts, createContact } from "@/lib/data/contacts";
import { contactError } from "./errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listContacts());
  } catch (error) {
    return contactError("GET /api/contacts", error);
  }
}

export async function POST(request: Request) {
  try {
    const contact = await createContact(await request.json());
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return contactError("POST /api/contacts", error);
  }
}
