import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId, NoWorkspaceError } from "@/lib/data/org";
import { getSessionUserId } from "@/lib/auth";
import { cleanSections, withExamples, type TaskTemplate } from "@/lib/checklist";
import { parseCodes } from "@/lib/matters/numbering";

export class TemplateError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message);
  }
}

type Row = { id: string; name: string; sections: unknown; matter_codes?: string[] | null; updated_at: string };
const toTemplate = (r: Row): TaskTemplate => ({
  id: r.id,
  name: r.name,
  sections: cleanSections(r.sections),
  matterCodes: parseCodes(r.matter_codes ?? []),
  updatedAt: r.updated_at,
});
const COLS = "id, name, sections, matter_codes, updated_at";
const COLS_OLD = "id, name, sections, updated_at"; // before migration 0025
// Runs a query with matter_codes, and again without it if 0025 hasn't been run yet.
async function withCodes<R extends { error: { message?: string } | null }>(run: (cols: string, codes: boolean) => PromiseLike<R>): Promise<R> {
  const r = await run(COLS, true);
  return r.error && /matter_codes/.test(r.error.message ?? "") ? run(COLS_OLD, false) : r;
}

function cleanName(name: unknown) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!n) throw new TemplateError(400, "Give the template a name.");
  return n;
}
function checkSections(sections: unknown) {
  const s = cleanSections(sections);
  if (!s.some((x) => x.items.length)) throw new TemplateError(400, "Add at least one checklist item.");
  return s;
}

export async function listTemplates(): Promise<TaskTemplate[]> {
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const { data, error } = await withCodes((cols) => db.from("task_templates").select(cols).eq("org_id", orgId).order("name"));
  if (error) throw error;
  return withExamples(((data ?? []) as unknown as Row[]).map(toTemplate));
}

export async function createTemplate(input: { name?: unknown; sections?: unknown; matterCodes?: unknown }): Promise<TaskTemplate> {
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const { count } = await db.from("task_templates").select("*", { count: "exact", head: true }).eq("org_id", orgId);
  if ((count ?? 0) >= 100) throw new TemplateError(400, "You can have up to 100 templates.");
  const fields: Record<string, unknown> = { org_id: orgId, name: cleanName(input.name), sections: checkSections(input.sections), created_by: await getSessionUserId() };
  const codes = parseCodes(input.matterCodes);
  const { data, error } = await withCodes((cols, has) =>
    db.from("task_templates").insert(has ? { ...fields, matter_codes: codes } : fields).select(cols).single()
  );
  if (error) throw error;
  return toTemplate(data as unknown as Row);
}

export async function updateTemplate(id: string, input: { name?: unknown; sections?: unknown; matterCodes?: unknown }): Promise<TaskTemplate> {
  const orgId = await getCurrentOrgId();
  const db = createAdminClient();
  const fields: Record<string, unknown> = { name: cleanName(input.name), sections: checkSections(input.sections), updated_at: new Date().toISOString() };
  const codes = parseCodes(input.matterCodes);
  const { data, error } = await withCodes((cols, has) =>
    db
      .from("task_templates")
      .update(has && input.matterCodes !== undefined ? { ...fields, matter_codes: codes } : fields)
      .eq("id", id)
      .eq("org_id", orgId)
      .select(cols)
      .maybeSingle()
  );
  if (error) throw error;
  if (!data) throw new TemplateError(404, "Template not found.");
  return toTemplate(data as unknown as Row);
}

export async function deleteTemplate(id: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await createAdminClient().from("task_templates").delete().eq("id", id).eq("org_id", orgId).select("id");
  if (error) throw error;
  if (!data?.length) throw new TemplateError(404, "Template not found.");
}

export function templateError(where: string, e: unknown) {
  if (e instanceof TemplateError || e instanceof NoWorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
  const x = e as { code?: string; message?: string };
  if (x?.code === "PGRST205" || x?.code === "42P01" || /task_templates/.test(x?.message ?? "")) {
    return NextResponse.json(
      { error: "Templates aren’t set up yet. Run supabase/migrations/0021_task_templates.sql in the Supabase SQL editor.", code: "setup_required" },
      { status: 503 }
    );
  }
  console.error(`${where} failed: ${x?.code ?? "error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
