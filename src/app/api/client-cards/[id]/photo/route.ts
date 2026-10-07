import { getCardPhoto, cardFail } from "@/lib/data/clientCards";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
    const photo = await getCardPhoto(id);
    if (!photo) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(photo.bytes), {
      headers: { "Content-Type": photo.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return cardFail("GET /api/client-cards/[id]/photo", error);
  }
}
