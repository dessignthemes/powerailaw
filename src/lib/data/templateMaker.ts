import "server-only";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { DocTemplateError } from "@/lib/data/docTemplates";
import { cleanFields, syncFields, TEMPLATE_CATEGORIES, type TemplateField } from "@/lib/docTemplates/format";
import { openDocx, paragraphs, tagDocx, type Block, type Replacement } from "@/lib/docTemplates/docxTag";
import { patternSuggestions, type Suggestion } from "@/lib/docTemplates/vocabulary";
import type { AiCtx } from "@/lib/ai/store";

// Template maker: the firm's Word file → reviewed fields → a tagged .docx
// template, with every save kept as a version (who and when).

const db = () => createAdminClient();
const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const setup = () => new DocTemplateError("The template maker needs a database update first (migration 0064).", 503, "setup_required");
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "42P01" || e.code === "PGRST204" || e.code === "PGRST205" || /file_path|doc_template_versions|format/.test(e.message ?? ""));

async function download(path: string): Promise<Uint8Array> {
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new DocTemplateError("The Word file couldn't be read. Please upload it again.", 404);
  return new Uint8Array(await data.arrayBuffer());
}
async function upload(path: string, bytes: Uint8Array) {
  const { error } = await db().storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: MIME, upsert: true });
  if (error) throw error;
}
const draftPrefix = (orgId: string) => `${orgId}/template-drafts/`;
function ownDraft(orgId: string, path: unknown): string {
  const p = String(path ?? "");
  if (!p.startsWith(draftPrefix(orgId)) || !/^[0-9a-f-]{36}\/template-drafts\/[0-9a-f-]{36}\.docx$/i.test(p)) throw new DocTemplateError("That upload wasn't found. Please upload the file again.", 404);
  return p;
}

export type MakerDraft = {
  draftPath: string;
  paragraphs: string[];
  suggestions: Suggestion[];
  template?: { id: string; name: string; category: string; description: string; fields: TemplateField[]; version: number };
};

export async function startFromUpload(ctx: AiCtx, bytes: Uint8Array): Promise<MakerDraft> {
  let paras: string[];
  try {
    paras = paragraphs(openDocx(bytes));
  } catch (e) {
    throw new DocTemplateError((e as Error).message);
  }
  if (!paras.some((p) => p.trim())) throw new DocTemplateError("That Word file has no text to work with.");
  const draftPath = `${draftPrefix(ctx.orgId)}${randomUUID()}.docx`;
  await upload(draftPath, bytes);
  return { draftPath, paragraphs: paras, suggestions: patternSuggestions(paras) };
}

// Keep working on a saved Word template (adds a new version when saved).
export async function startFromTemplate(ctx: AiCtx, templateId: string): Promise<MakerDraft> {
  const r = await db().from("doc_templates").select("id, name, category, description, fields, format, file_path, version, body").eq("org_id", ctx.orgId).eq("id", templateId).maybeSingle();
  if (r.error) {
    if (missing(r.error)) throw setup();
    throw r.error;
  }
  const t = r.data as { id: string; name: string; category: string; description: string; fields: unknown; format: string; file_path: string | null; version: number; body: string } | null;
  if (!t) throw new DocTemplateError("That template wasn't found.", 404);
  if (t.format !== "docx" || !t.file_path) throw new DocTemplateError("This template wasn't made from a Word file, so it opens in the text editor.");
  const bytes = await download(t.file_path);
  const draftPath = `${draftPrefix(ctx.orgId)}${randomUUID()}.docx`;
  await upload(draftPath, bytes);
  const paras = paragraphs(openDocx(bytes));
  return {
    draftPath,
    paragraphs: paras,
    suggestions: patternSuggestions(paras),
    template: { id: t.id, name: t.name, category: t.category, description: t.description, fields: syncFields(t.body ?? "", cleanFields(t.fields)), version: t.version ?? 1 },
  };
}

export async function draftParagraphs(orgId: string, path: unknown): Promise<string[]> {
  return paragraphs(openDocx(await download(ownDraft(orgId, path))));
}

export async function saveFromMaker(
  ctx: AiCtx,
  b: { draftPath?: unknown; templateId?: unknown; name?: unknown; category?: unknown; description?: unknown; replacements?: unknown; blocks?: unknown; fields?: unknown; note?: unknown }
): Promise<{ id: string; version: number }> {
  const draftPath = ownDraft(ctx.orgId, b.draftPath);
  const name = String(b.name ?? "").trim().slice(0, 160);
  if (!name) throw new DocTemplateError("Give the template a name.");
  const category = TEMPLATE_CATEGORIES.includes(String(b.category ?? "")) ? String(b.category) : "";
  const reps: Replacement[] = (Array.isArray(b.replacements) ? b.replacements : [])
    .slice(0, 300)
    .map((r) => ({ find: String((r as Replacement).find ?? "").slice(0, 500), key: String((r as Replacement).key ?? ""), all: (r as Replacement).all !== false }))
    .filter((r) => r.find.trim() && /^[a-z][a-z0-9_]{0,48}$/.test(r.key));
  const blocks: Block[] = (Array.isArray(b.blocks) ? b.blocks : [])
    .slice(0, 60)
    .map((x) => ({ start: Math.floor(Number((x as Block).start)), end: Math.floor(Number((x as Block).end)), key: String((x as Block).key ?? "") }))
    .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.start >= 0 && x.end >= x.start && /^[a-z][a-z0-9_]{0,48}$/.test(x.key));

  const tagged = tagDocx(await download(draftPath), reps, blocks);
  const body = paragraphs(openDocx(tagged)).join("\n\n").slice(0, 120000);
  const fields = syncFields(body, cleanFields(b.fields));
  if (!fields.length) throw new DocTemplateError("Mark at least one field (select text in the document, or accept a suggestion).");

  const s = db();
  const existingId = typeof b.templateId === "string" && /^[0-9a-f-]{36}$/i.test(b.templateId) ? b.templateId : null;
  let id = existingId;
  let version = 1;
  if (existingId) {
    const cur = await s.from("doc_templates").select("version").eq("org_id", ctx.orgId).eq("id", existingId).maybeSingle();
    if (cur.error) {
      if (missing(cur.error)) throw setup();
      throw cur.error;
    }
    if (!cur.data) throw new DocTemplateError("That template wasn't found.", 404);
    version = ((cur.data as { version?: number }).version ?? 1) + 1;
  } else id = randomUUID();
  const filePath = `${ctx.orgId}/templates/${id}/v${version}.docx`;
  await upload(filePath, tagged);
  const row = { name, category, description: String(b.description ?? "").trim().slice(0, 600), body, fields, source: "upload", format: "docx", file_path: filePath, version, updated_at: new Date().toISOString() };
  const w = existingId
    ? await s.from("doc_templates").update(row).eq("org_id", ctx.orgId).eq("id", existingId)
    : await s.from("doc_templates").insert({ ...row, id, org_id: ctx.orgId, created_by: ctx.userId });
  if (w.error) {
    if (missing(w.error)) throw setup();
    throw w.error;
  }
  const v = await s.from("doc_template_versions").insert({ org_id: ctx.orgId, template_id: id, version, name, body, fields, file_path: filePath, note: String(b.note ?? "").slice(0, 300), created_by: ctx.userId });
  if (v.error && !missing(v.error)) console.error("Saving the template version failed:", v.error.message);
  await s.storage.from(DOCUMENTS_BUCKET).remove([draftPath]).catch(() => undefined);
  return { id: id!, version };
}

export type TemplateVersion = { version: number; name: string; createdAt: string; createdBy: string | null; note: string; fieldCount: number };

export async function listVersions(orgId: string, templateId: string): Promise<TemplateVersion[]> {
  const r = await db().from("doc_template_versions").select("version, name, created_at, created_by, note, fields").eq("org_id", orgId).eq("template_id", templateId).order("version", { ascending: false }).limit(100);
  if (r.error) {
    if (missing(r.error)) throw setup();
    throw r.error;
  }
  return ((r.data ?? []) as { version: number; name: string; created_at: string; created_by: string | null; note: string; fields: unknown }[]).map((x) => ({ version: x.version, name: x.name, createdAt: x.created_at, createdBy: x.created_by, note: x.note, fieldCount: Array.isArray(x.fields) ? x.fields.length : 0 }));
}

// Roll back: an older version becomes the newest (saved as a new version, nothing is lost).
export async function restoreVersion(ctx: AiCtx, templateId: string, version: number): Promise<{ version: number }> {
  const s = db();
  const old = await s.from("doc_template_versions").select("name, body, fields, file_path").eq("org_id", ctx.orgId).eq("template_id", templateId).eq("version", version).maybeSingle();
  if (old.error) {
    if (missing(old.error)) throw setup();
    throw old.error;
  }
  const o = old.data as { name: string; body: string; fields: unknown; file_path: string | null } | null;
  if (!o) throw new DocTemplateError("That version wasn't found.", 404);
  const cur = await s.from("doc_templates").select("version").eq("org_id", ctx.orgId).eq("id", templateId).maybeSingle();
  const next = ((cur.data as { version?: number } | null)?.version ?? 1) + 1;
  let filePath = o.file_path;
  if (o.file_path) {
    filePath = `${ctx.orgId}/templates/${templateId}/v${next}.docx`;
    await upload(filePath, await download(o.file_path));
  }
  const up = await s.from("doc_templates").update({ name: o.name, body: o.body, fields: o.fields, file_path: filePath, version: next, updated_at: new Date().toISOString() }).eq("org_id", ctx.orgId).eq("id", templateId);
  if (up.error) throw up.error;
  await s.from("doc_template_versions").insert({ org_id: ctx.orgId, template_id: templateId, version: next, name: o.name, body: o.body, fields: o.fields, file_path: filePath, note: `Restored version ${version}`, created_by: ctx.userId });
  return { version: next };
}

// The tagged Word file of a template, for making documents.
export async function templateFile(orgId: string, templateId: string): Promise<{ bytes: Uint8Array; fields: TemplateField[]; name: string } | null> {
  const r = await db().from("doc_templates").select("name, body, fields, format, file_path").eq("org_id", orgId).eq("id", templateId).maybeSingle();
  if (r.error || !r.data) return null;
  const t = r.data as { name: string; body: string; fields: unknown; format?: string; file_path?: string | null };
  if (t.format !== "docx" || !t.file_path) return null;
  return { bytes: await download(t.file_path), fields: syncFields(t.body ?? "", cleanFields(t.fields)), name: t.name };
}
