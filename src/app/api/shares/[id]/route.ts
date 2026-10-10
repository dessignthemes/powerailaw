import { NextResponse } from "next/server";
import {
  shareDetail,
  cancelShare,
  newLink,
  firmStartUpload,
  firmFinishUpload,
  firmDownload,
  firmRemoveFile,
  shareFail,
  ShareError,
} from "@/lib/shares/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function GET(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    return NextResponse.json(await shareDetail(id));
  } catch (e) {
    return shareFail("GET /api/shares/[id]", e);
  }
}

// Cancel the link now and delete its files.
export async function DELETE(_r: Request, { params }: P) {
  try {
    const { id } = await params;
    await cancelShare(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return shareFail("DELETE /api/shares/[id]", e);
  }
}

export async function POST(request: Request, { params }: P) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fileId = String(body.fileId ?? "");
    switch (body.action) {
      case "newLink":
        return NextResponse.json(await newLink(id));
      case "upload":
        return NextResponse.json(await firmStartUpload(id, body));
      case "complete":
        return NextResponse.json({ file: await firmFinishUpload(id, fileId) });
      case "download":
        return NextResponse.json(await firmDownload(id, fileId));
      case "removeFile":
        await firmRemoveFile(id, fileId);
        return NextResponse.json({ ok: true });
      default:
        throw new ShareError(400, "Unknown request.");
    }
  } catch (e) {
    return shareFail("POST /api/shares/[id]", e);
  }
}
