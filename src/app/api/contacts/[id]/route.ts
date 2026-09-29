import { NextResponse } from "next/server";
import { updateContact, deleteContact } from "@/lib/data/contacts";
import { contactError } from "../errors";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contact = await updateContact(id, await request.json());
    return NextResponse.json({ contact });
  } catch (error) {
    return contactError("PATCH /api/contacts/[id]", error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteContact(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return contactError("DELETE /api/contacts/[id]", error);
  }
}
