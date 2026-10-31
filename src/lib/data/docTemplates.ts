import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanFields, syncFields, TEMPLATE_CATEGORIES, type DocTemplate } from "@/lib/docTemplates/format";

export class DocTemplateError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const db = () => createAdminClient();
const setup = () => new DocTemplateError("AI Templates need a database update. Run supabase/migrations/0049_doc_templates.sql in the Supabase SQL editor, then refresh.", 503, "setup_required");
function check<T>(r: { data: T; error: { code?: string; message?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "42P01" || r.error.code === "PGRST205" || /doc_templates/.test(r.error.message ?? "")) throw setup();
    throw r.error;
  }
  return r.data;
}

type Row = { id: string; name: string; category: string; description: string; body: string; fields: unknown; source: DocTemplate["source"]; updated_at: string; format?: "text" | "docx" | null; version?: number | null };
const toTemplate = (r: Row): DocTemplate => ({
  id: r.id,
  name: r.name,
  category: r.category,
  description: r.description ?? "",
  body: r.body ?? "",
  fields: syncFields(r.body ?? "", cleanFields(r.fields)),
  source: r.source,
  updatedAt: r.updated_at,
  format: r.format === "docx" ? "docx" : "text",
  version: r.version ?? 1,
});

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// What the browser sends when saving; checked and tidied here.
export function cleanInput(body: Record<string, unknown>) {
  const name = s(body.name, 160);
  if (!name) throw new DocTemplateError("Give the template a name.");
  const text = typeof body.body === "string" ? body.body.replace(/\r\n?/g, "\n").slice(0, 120000) : "";
  const category = TEMPLATE_CATEGORIES.includes(s(body.category, 60)) ? s(body.category, 60) : "";
  const source = (["ai", "paste", "upload", "blank", "sample"] as const).includes(body.source as DocTemplate["source"]) ? (body.source as DocTemplate["source"]) : "blank";
  return { name, category, description: s(body.description, 600), body: text, fields: syncFields(text, cleanFields(body.fields)), source };
}

export async function listDocTemplates(orgId: string): Promise<DocTemplate[]> {
  const rows = check(await db().from("doc_templates").select("*").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(500)) as Row[];
  return rows.map(toTemplate);
}

export async function getDocTemplate(orgId: string, id: string): Promise<DocTemplate> {
  const row = check(await db().from("doc_templates").select("*").eq("org_id", orgId).eq("id", id).maybeSingle()) as Row | null;
  if (!row) throw new DocTemplateError("That template wasn't found.", 404);
  return toTemplate(row);
}

export async function createDocTemplate(orgId: string, userId: string, body: Record<string, unknown>): Promise<DocTemplate> {
  const v = cleanInput(body);
  const row = check(await db().from("doc_templates").insert({ ...v, org_id: orgId, created_by: userId }).select("*").single()) as Row;
  return toTemplate(row);
}

export async function updateDocTemplate(orgId: string, id: string, body: Record<string, unknown>): Promise<DocTemplate> {
  const v = cleanInput(body);
  const row = check(await db().from("doc_templates").update({ ...v, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id).select("*").maybeSingle()) as Row | null;
  if (!row) throw new DocTemplateError("That template wasn't found.", 404);
  return toTemplate(row);
}

export async function deleteDocTemplate(orgId: string, id: string) {
  check(await db().from("doc_templates").delete().eq("org_id", orgId).eq("id", id));
}
