import { NextResponse } from "next/server";
import { NoWorkspaceError } from "@/lib/data/org";
import { globalSearch, searchMyEvents, SEARCH_TYPES, type SearchType } from "@/lib/data/search";

export const dynamic = "force-dynamic";

// GET ?q=…&types=matters,contacts,… → { hits } (events: only when types=events, they're slower)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const asked = (url.searchParams.get("types") ?? "").split(",").filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t));
    const types = asked.length ? asked : SEARCH_TYPES.filter((t) => t !== "events");
    if (types.length === 1 && types[0] === "events") return NextResponse.json({ hits: await searchMyEvents(q).catch(() => []) });
    return NextResponse.json({ hits: await globalSearch(q, types.filter((t) => t !== "events")) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/search failed:", e);
    return NextResponse.json({ error: "Search didn't work. Please try again." }, { status: 500 });
  }
}
