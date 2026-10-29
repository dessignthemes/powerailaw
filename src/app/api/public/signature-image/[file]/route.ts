import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif" };

// GET /api/public/signature-image/<userId>.<random>.<ext> — a picture from someone's
// email signature, shown in recipients' mail. Public on purpose (like any email
// logo), at an unguessable address; cached for a year (pictures never change).
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([0-9a-f-]{36})\.([0-9a-f]{32})\.(png|jpg|gif)$/.exec(file ?? "");
  if (!m) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient().storage.from("email-signatures").download(`${m[1]}/${m[2]}.${m[3]}`);
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": TYPES[m[3]],
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
