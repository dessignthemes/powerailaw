import { NextResponse } from "next/server";
import { getAiCtx } from "@/lib/ai/store";
import { extractText } from "@/lib/ai/extract";
import { failTemplate } from "@/lib/docTemplates/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST (multipart, "file") → the text of a Word or PDF file, to turn into a template.
export async function POST(request: Request) {
  try {
    await getAiCtx();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a Word (.docx) or PDF file." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Files must be 15 MB or smaller." }, { status: 400 });
    const r = await extractText(new Uint8Array(await file.arrayBuffer()));
    const text = r.status === "ready" ? r.chunks.map((c) => c.content).join("\n\n") : "";
    if (!text.trim()) {
      const why = r.status === "needs_ocr" ? "That PDF is a scan (a picture of the page), so its text can't be read. Use the original Word file." : r.detail || "No text could be read from that file.";
      return NextResponse.json({ error: why }, { status: 400 });
    }
    return NextResponse.json({ text: text.slice(0, 60000), name: file.name.replace(/\.(docx|pdf|txt)$/i, "") });
  } catch (e) {
    return failTemplate("POST /api/doc-templates/extract", e);
  }
}
