import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiCtx } from "@/lib/ai/store";
import { createMatterTasks } from "@/lib/ai/matterReview";
import { AccessError } from "@/lib/data/documents";
import { NoWorkspaceError } from "@/lib/data/org";

export const dynamic = "force-dynamic";

const body = z.object({
  matterId: z.string().uuid(),
  tasks: z.array(z.object({ title: z.string().min(1).max(200), description: z.string().max(4000).default(""), priority: z.string().default("Medium"), dueDate: z.string().nullable().default(null) })).min(1).max(20),
});

// POST { matterId, tasks } — creates the chosen next steps as tasks on the matter.
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Nothing to create." }, { status: 400 });
    const ctx = await getAiCtx();
    return NextResponse.json({ created: await createMatterTasks(ctx, parsed.data.matterId, parsed.data.tasks) });
  } catch (error) {
    if (error instanceof AccessError || error instanceof NoWorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("POST /api/ai/matter-review/tasks failed:", error);
    return NextResponse.json({ error: "The tasks couldn't be created. Please try again." }, { status: 500 });
  }
}
