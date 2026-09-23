import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg, AccessError, DOCUMENTS_BUCKET } from "@/lib/data/documents";
import { extractText, detectKind, MIME_BY_KIND, MAX_FILE_BYTES, type ExtractedChunk } from "@/lib/ai/extract";
import { toSearchQuery, sensitiveReason } from "@/lib/ai/safety";

export const ATTACHMENTS_BUCKET = "ai-attachments";

// Every function takes a server-derived context. IDs from the browser are
// only ever used together with org_id / user_id filters.
export type AiCtx = { userId: string; email: string | null; orgId: string };

export async function getAiCtx(): Promise<AiCtx> {
  const { user, orgId } = await requireUserOrg();
  return { userId: user.id, email: user.email, orgId };
}

const db = () => createAdminClient();

// ── Matters ───────────────────────────────────────────────────────────────

export async function assertMatter(ctx: AiCtx, matterId: string) {
  const { data } = await db().from("matters").select("id, title").eq("id", matterId).eq("org_id", ctx.orgId).maybeSingle();
  if (!data) throw new AccessError(404, "Matter not found, or you don't have access to it.");
  return data as { id: string; title: string };
}

export type MatterContext = {
  matter: Record<string, unknown> & { id: string; title: string };
  client: { id: string; name: string; type: string; email: string | null; phone: string | null } | null;
  documents: { id: string; title: string; versionId: string; versionNumber: number; pageCount: number; indexStatus: string | null }[];
  tasks: { id: string; title: string; status: string; priority: string; dueDate: string | null }[];
};

export async function getMatterContext(ctx: AiCtx, matterId: string): Promise<MatterContext> {
  const s = db();
  const { data: m } = await s
    .from("matters")
    .select("id, title, status, category, due_date, counterparty, blocker, description, private_notes, billing_type, hourly_rate, value, client_id, created_at")
    .eq("id", matterId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!m) throw new AccessError(404, "Matter not found, or you don't have access to it.");

  const [client, docs, tasks] = await Promise.all([
    m.client_id
      ? s.from("clients").select("id, name, type, email, phone").eq("id", m.client_id).eq("org_id", ctx.orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    s
      .from("documents")
      .select("id, title, document_versions(id, version_number, page_count)")
      .eq("org_id", ctx.orgId)
      .eq("matter_id", matterId)
      .order("updated_at", { ascending: false })
      .limit(50),
    s
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .eq("org_id", ctx.orgId)
      .eq("matter_id", matterId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50),
  ]);

  type DocRow = { id: string; title: string; document_versions: { id: string; version_number: number; page_count: number }[] };
  const latest = ((docs.data ?? []) as DocRow[])
    .map((d) => {
      const v = [...(d.document_versions ?? [])].sort((a, b) => b.version_number - a.version_number)[0];
      return v ? { id: d.id, title: d.title, versionId: v.id, versionNumber: v.version_number, pageCount: v.page_count } : null;
    })
    .filter(Boolean) as Omit<MatterContext["documents"][number], "indexStatus">[];

  const idx = latest.length
    ? await s.from("ai_document_index").select("version_id, status").in("version_id", latest.map((d) => d.versionId))
    : { data: [] };
  const statusBy = new Map(((idx.data ?? []) as { version_id: string; status: string }[]).map((r) => [r.version_id, r.status]));

  return {
    matter: m as MatterContext["matter"],
    client: (client.data as MatterContext["client"]) ?? null,
    documents: latest.map((d) => ({ ...d, indexStatus: statusBy.get(d.versionId) ?? null })),
    tasks: ((tasks.data ?? []) as { id: string; title: string; status: string; priority: string; due_date: string | null }[]).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
    })),
  };
}

// ── Conversations & messages ──────────────────────────────────────────────

export type ConversationRow = { id: string; title: string; matter_id: string | null; created_at: string; updated_at: string };

export async function listConversations(ctx: AiCtx) {
  const { data, error } = await db()
    .from("ai_conversations")
    .select("id, title, matter_id, created_at, updated_at, matters(title)")
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((c) => {
    const row = c as unknown as ConversationRow & { matters: { title: string } | null };
    return { id: row.id, title: row.title, matterId: row.matter_id, matterTitle: row.matters?.title ?? null, updatedAt: row.updated_at };
  });
}

export async function createConversation(ctx: AiCtx, matterId: string | null, title?: string) {
  if (matterId) await assertMatter(ctx, matterId);
  const { data, error } = await db()
    .from("ai_conversations")
    .insert({ org_id: ctx.orgId, user_id: ctx.userId, matter_id: matterId, title: (title ?? "New chat").slice(0, 120) })
    .select("id, title, matter_id, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as ConversationRow;
}

export async function getConversation(ctx: AiCtx, id: string): Promise<ConversationRow> {
  const { data } = await db()
    .from("ai_conversations")
    .select("id, title, matter_id, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new AccessError(404, "Conversation not found.");
  // If the matter was deleted or moved out of the org, the conversation closes.
  if (data.matter_id) await assertMatter(ctx, data.matter_id);
  return data as ConversationRow;
}

export async function renameConversation(ctx: AiCtx, id: string, title: string) {
  await getConversation(ctx, id);
  const clean = title.trim().slice(0, 120) || "Untitled chat";
  const { error } = await db().from("ai_conversations").update({ title: clean }).eq("id", id).eq("user_id", ctx.userId);
  if (error) throw error;
  return clean;
}

export async function touchConversation(id: string, title?: string) {
  await db()
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString(), ...(title ? { title } : {}) })
    .eq("id", id);
}

// Deletes the conversation, its messages, attachments (files + derived text
// chunks) and pending actions. Usage counts and audit events are kept.
export async function deleteConversation(ctx: AiCtx, id: string) {
  await getConversation(ctx, id);
  const s = db();
  const { data: files } = await s.from("ai_files").select("storage_path").eq("conversation_id", id).eq("user_id", ctx.userId);
  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length) await s.storage.from(ATTACHMENTS_BUCKET).remove(paths);
  const { error } = await s.from("ai_conversations").delete().eq("id", id).eq("user_id", ctx.userId);
  if (error) throw error;
  await audit(ctx, "conversation.deleted", "conversation", id, null);
}

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "interrupted" | "failed";
  error: string | null;
  citations: unknown[];
  events: unknown[];
  attachment_ids: string[];
  created_at: string;
};

export async function listMessages(ctx: AiCtx, conversationId: string) {
  await getConversation(ctx, conversationId);
  const { data, error } = await db()
    .from("ai_messages")
    .select("id, role, content, status, error, citations, events, attachment_ids, created_at")
    .eq("conversation_id", conversationId)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const staleMs = 5 * 60 * 1000;
  return ((data ?? []) as MessageRow[]).map((m) =>
    // A reply still "streaming" long after it started was cut off (e.g. the
    // server function timed out); show it as interrupted, which it is.
    m.status === "streaming" && Date.now() - new Date(m.created_at).getTime() > staleMs
      ? { ...m, status: "interrupted" as const, error: m.error ?? "The response was cut off." }
      : m
  );
}

export async function insertMessage(
  ctx: AiCtx,
  conversationId: string,
  m: { role: "user" | "assistant"; content: string; status: MessageRow["status"]; attachmentIds?: string[]; model?: string }
) {
  const { data, error } = await db()
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      org_id: ctx.orgId,
      role: m.role,
      content: m.content,
      status: m.status,
      attachment_ids: m.attachmentIds ?? [],
      model: m.model ?? null,
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return data as { id: string; created_at: string };
}

export async function updateMessage(
  id: string,
  patch: Partial<{ content: string; status: MessageRow["status"]; error: string | null; citations: unknown[]; events: unknown[]; input_tokens: number; output_tokens: number }>
) {
  const { error } = await db().from("ai_messages").update(patch).eq("id", id);
  if (error) throw error;
}

// ── Attachments ───────────────────────────────────────────────────────────

export async function createAttachmentUpload(ctx: AiCtx, conversationId: string, size: number) {
  await getConversation(ctx, conversationId);
  if (!Number.isFinite(size) || size <= 0) throw new AccessError(403, "That file is empty.");
  if (size > MAX_FILE_BYTES) throw new AccessError(403, "Files must be 15 MB or smaller.");
  const path = `${ctx.orgId}/${conversationId}/${crypto.randomUUID()}`;
  const { data, error } = await db().storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Could not create upload URL");
  return { path: data.path, token: data.token };
}

export type FileRow = { id: string; name: string; mime_type: string; size_bytes: number; status: string; status_detail: string | null; page_count: number | null; created_at: string };

async function insertChunks(orgId: string, owner: { file_id?: string; version_id?: string }, chunks: ExtractedChunk[]) {
  const s = db();
  for (let i = 0; i < chunks.length; i += 400) {
    const rows = chunks.slice(i, i + 400).map((c) => ({ org_id: orgId, ...owner, chunk_index: c.index, page: c.page, section: c.section, content: c.content }));
    const { error } = await s.from("ai_chunks").insert(rows);
    if (error) throw error;
  }
}

// Validates, extracts and indexes an uploaded attachment. The file is kept
// even if unreadable, with a status that explains why.
export async function finalizeAttachment(ctx: AiCtx, conversationId: string, path: string, name: string): Promise<FileRow> {
  const conv = await getConversation(ctx, conversationId);
  const prefix = `${ctx.orgId}/${conversationId}/`;
  if (!path.startsWith(prefix) || path.includes("..") || !/^[0-9a-f/-]+$/i.test(path)) {
    throw new AccessError(403, "That upload doesn't belong to this conversation.");
  }
  const s = db();
  const { data: blob, error: dlErr } = await s.storage.from(ATTACHMENTS_BUCKET).download(path);
  if (dlErr || !blob) throw new AccessError(404, "The upload didn't finish. Please try again.");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const kind = detectKind(bytes);
  if (!kind) {
    await s.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    throw new AccessError(403, "Only PDF, Word (.docx) and plain-text (.txt) files are supported.");
  }

  const cleanName = name.replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 200) || `attachment.${kind}`;
  const { data: file, error } = await s
    .from("ai_files")
    .insert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      conversation_id: conversationId,
      matter_id: conv.matter_id,
      name: cleanName,
      mime_type: MIME_BY_KIND[kind],
      size_bytes: bytes.byteLength,
      storage_path: path,
      status: "processing",
    })
    .select("id")
    .single();
  if (error) throw error;

  const result = await extractText(bytes);
  if (result.status === "failed") {
    await s.from("ai_files").update({ status: "failed", status_detail: result.detail }).eq("id", file.id);
  } else {
    await insertChunks(ctx.orgId, { file_id: file.id }, result.chunks);
    await s
      .from("ai_files")
      .update({ status: result.status, status_detail: result.detail ?? null, page_count: result.pageCount })
      .eq("id", file.id);
  }
  await audit(ctx, "attachment.uploaded", "ai_file", file.id, conversationId);
  return getFile(ctx, file.id);
}

export async function getFile(ctx: AiCtx, id: string): Promise<FileRow> {
  const { data } = await db()
    .from("ai_files")
    .select("id, name, mime_type, size_bytes, status, status_detail, page_count, created_at, storage_path")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new AccessError(404, "File not found.");
  const { storage_path: _omit, ...rest } = data as FileRow & { storage_path: string };
  void _omit;
  return rest;
}

export async function listConversationFiles(ctx: AiCtx, conversationId: string): Promise<FileRow[]> {
  const { data } = await db()
    .from("ai_files")
    .select("id, name, mime_type, size_bytes, status, status_detail, page_count, created_at")
    .eq("conversation_id", conversationId)
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .order("created_at");
  return (data ?? []) as FileRow[];
}

export async function fileDownloadUrl(ctx: AiCtx, id: string) {
  const { data } = await db()
    .from("ai_files")
    .select("storage_path")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new AccessError(404, "File not found.");
  const { data: signed, error } = await db().storage.from(ATTACHMENTS_BUCKET).createSignedUrl(data.storage_path, 120);
  if (error || !signed) throw error ?? new Error("Could not create download URL");
  return signed.signedUrl;
}

export async function deleteFile(ctx: AiCtx, id: string) {
  const s = db();
  const { data } = await s.from("ai_files").select("storage_path, conversation_id").eq("id", id).eq("org_id", ctx.orgId).eq("user_id", ctx.userId).maybeSingle();
  if (!data) throw new AccessError(404, "File not found.");
  await s.storage.from(ATTACHMENTS_BUCKET).remove([data.storage_path]);
  await s.from("ai_files").delete().eq("id", id); // chunks cascade
  await audit(ctx, "attachment.deleted", "ai_file", id, data.conversation_id);
}

// ── Matter document indexing (Power PDF storage) ──────────────────────────

// Extracts and indexes one document version the first time it's needed.
export async function ensureVersionIndexed(ctx: AiCtx, versionId: string) {
  const s = db();
  const { data: existing } = await s.from("ai_document_index").select("status").eq("version_id", versionId).maybeSingle();
  if (existing) return existing.status as string;
  const { data: v } = await s.from("document_versions").select("storage_path").eq("id", versionId).eq("org_id", ctx.orgId).maybeSingle();
  if (!v) return null;
  const { data: blob } = await s.storage.from(DOCUMENTS_BUCKET).download(v.storage_path);
  if (!blob) return null;
  const result = await extractText(new Uint8Array(await blob.arrayBuffer()));
  if (result.status !== "failed") await insertChunks(ctx.orgId, { version_id: versionId }, result.chunks);
  const status = result.status;
  const { error } = await s.from("ai_document_index").insert({
    version_id: versionId,
    org_id: ctx.orgId,
    status,
    status_detail: result.detail ?? null,
    page_count: result.status === "failed" ? null : result.pageCount,
  });
  // Another request may have indexed it at the same moment; that's fine.
  if (error && error.code !== "23505") throw error;
  return status;
}

// ── Retrieval ─────────────────────────────────────────────────────────────

export type SourceRef = {
  kind: "document" | "attachment";
  documentId?: string;
  versionId?: string;
  fileId?: string;
  name: string;
  page: number | null;
  section: string | null;
};
export type Excerpt = SourceRef & { content: string };

export type SearchScope = {
  fileIds: string[];
  versions: { versionId: string; documentId: string; name: string }[];
  fileNames: Map<string, string>;
};

// General chats: only this conversation's attachments. Matter chats: those
// plus the matter's latest document versions. Nothing else, ever.
export async function buildSearchScope(ctx: AiCtx, conv: ConversationRow, matterDocs?: MatterContext["documents"]): Promise<SearchScope> {
  const files = await listConversationFiles(ctx, conv.id);
  const readyFiles = files.filter((f) => f.status === "ready");
  const scope: SearchScope = { fileIds: readyFiles.map((f) => f.id), versions: [], fileNames: new Map(readyFiles.map((f) => [f.id, f.name])) };
  if (conv.matter_id && matterDocs) {
    // Index up to 4 not-yet-indexed documents per request to bound latency.
    let budget = 4;
    for (const d of matterDocs) {
      let status = d.indexStatus;
      if (!status && budget > 0) {
        budget--;
        status = await ensureVersionIndexed(ctx, d.versionId).catch(() => null);
        d.indexStatus = status;
      }
      if (status === "ready") scope.versions.push({ versionId: d.versionId, documentId: d.id, name: d.title });
    }
  }
  return scope;
}

type ChunkRow = { id: string; file_id: string | null; version_id: string | null; chunk_index: number; page: number | null; section: string | null; content: string };

function toExcerpt(scope: SearchScope, r: ChunkRow): Excerpt | null {
  if (r.file_id) {
    const name = scope.fileNames.get(r.file_id);
    if (!name) return null;
    return { kind: "attachment", fileId: r.file_id, name, page: r.page, section: r.section, content: r.content };
  }
  const v = scope.versions.find((x) => x.versionId === r.version_id);
  if (!v) return null;
  return { kind: "document", documentId: v.documentId, versionId: v.versionId, name: v.name, page: r.page, section: r.section, content: r.content };
}

export async function searchChunks(ctx: AiCtx, scope: SearchScope, question: string, limit = 8): Promise<Excerpt[]> {
  const versionIds = scope.versions.map((v) => v.versionId);
  if (!scope.fileIds.length && !versionIds.length) return [];
  const s = db();
  const out: Excerpt[] = [];
  const seen = new Set<string>();
  const q = toSearchQuery(question);
  if (q) {
    const { data, error } = await s.rpc("ai_search_chunks", {
      p_org: ctx.orgId,
      p_file_ids: scope.fileIds,
      p_version_ids: versionIds,
      p_query: q,
      p_limit: limit,
    });
    if (error) throw error;
    for (const r of (data ?? []) as ChunkRow[]) {
      const e = toExcerpt(scope, r);
      if (e && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(e);
      }
    }
  }
  // "Summarize this document" rarely matches keywords: fall back to the
  // opening chunks of each in-scope document, still within scope.
  if (out.length < Math.min(3, limit)) {
    const per = Math.max(2, Math.floor(limit / Math.max(1, scope.fileIds.length + versionIds.length)));
    const lead = async (col: "file_id" | "version_id", id: string) => {
      const { data } = await s
        .from("ai_chunks")
        .select("id, file_id, version_id, chunk_index, page, section, content")
        .eq("org_id", ctx.orgId)
        .eq(col, id)
        .order("chunk_index")
        .limit(per);
      return (data ?? []) as ChunkRow[];
    };
    const rows = (await Promise.all([...scope.fileIds.map((id) => lead("file_id", id)), ...versionIds.map((id) => lead("version_id", id))])).flat();
    for (const r of rows) {
      if (out.length >= limit) break;
      const e = toExcerpt(scope, r);
      if (e && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(e);
      }
    }
  }
  return out;
}

// ── Memory ────────────────────────────────────────────────────────────────

export type MemoryScope = "personal" | "firm" | "matter";
export type MemoryRow = {
  id: string;
  scope: MemoryScope;
  matter_id: string | null;
  content: string;
  enabled: boolean;
  source: "manual" | "suggested";
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

const MEMORY_COLS = "id, scope, matter_id, content, enabled, source, source_conversation_id, created_at, updated_at";

export async function listMemories(ctx: AiCtx, matterId: string | null) {
  const s = db();
  const personal = s.from("ai_memories").select(MEMORY_COLS).eq("org_id", ctx.orgId).eq("scope", "personal").eq("user_id", ctx.userId);
  const firm = s.from("ai_memories").select(MEMORY_COLS).eq("org_id", ctx.orgId).eq("scope", "firm");
  const matter = matterId
    ? (await assertMatter(ctx, matterId), s.from("ai_memories").select(MEMORY_COLS).eq("org_id", ctx.orgId).eq("scope", "matter").eq("matter_id", matterId))
    : null;
  const [p, f, m] = await Promise.all([personal.order("updated_at", { ascending: false }), firm.order("updated_at", { ascending: false }), matter?.order("updated_at", { ascending: false })]);
  if (p.error) throw p.error;
  if (f.error) throw f.error;
  return {
    personal: (p.data ?? []) as MemoryRow[],
    firm: (f.data ?? []) as MemoryRow[],
    matter: ((m?.data ?? []) as MemoryRow[]),
  };
}

function checkMemoryContent(content: string) {
  const clean = content.trim().replace(/\s+/g, " ");
  if (!clean) throw new AccessError(403, "Memory can't be empty.");
  if (clean.length > 1000) throw new AccessError(403, "Keep memories under 1,000 characters.");
  const why = sensitiveReason(clean);
  if (why) throw new AccessError(403, `This looks like it contains ${why}. Credentials and sensitive identifiers can't be saved to memory.`);
  return clean;
}

export async function createMemory(
  ctx: AiCtx,
  input: { scope: MemoryScope; content: string; matterId?: string | null; source?: "manual" | "suggested"; conversationId?: string | null }
) {
  const content = checkMemoryContent(input.content);
  let matterId: string | null = null;
  if (input.scope === "matter") {
    if (!input.matterId) throw new AccessError(403, "Matter memories need a matter.");
    matterId = (await assertMatter(ctx, input.matterId)).id;
  }
  let convId: string | null = null;
  if (input.conversationId) {
    const conv = await getConversation(ctx, input.conversationId);
    // A matter fact can only come from a conversation about that matter.
    if (input.scope === "matter" && conv.matter_id !== matterId) throw new AccessError(403, "That fact belongs to a different matter.");
    convId = conv.id;
  }
  // Approving the same suggestion twice (e.g. after a reload) returns the
  // existing memory instead of creating a duplicate.
  let dupe = db().from("ai_memories").select(MEMORY_COLS).eq("org_id", ctx.orgId).eq("scope", input.scope).eq("content", content);
  if (input.scope === "personal") dupe = dupe.eq("user_id", ctx.userId);
  if (matterId) dupe = dupe.eq("matter_id", matterId);
  const { data: existing } = await dupe.limit(1).maybeSingle();
  if (existing) return existing as MemoryRow;

  const { data, error } = await db()
    .from("ai_memories")
    .insert({
      org_id: ctx.orgId,
      scope: input.scope,
      user_id: input.scope === "personal" ? ctx.userId : null,
      matter_id: matterId,
      content,
      source: input.source ?? "manual",
      source_conversation_id: convId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select(MEMORY_COLS)
    .single();
  if (error) throw error;
  await audit(ctx, "memory.created", "memory", data.id, convId);
  return data as MemoryRow;
}

async function getOwnedMemory(ctx: AiCtx, id: string) {
  const { data } = await db().from("ai_memories").select("id, scope, user_id, matter_id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (!data || (data.scope === "personal" && data.user_id !== ctx.userId)) throw new AccessError(404, "Memory not found.");
  if (data.matter_id) await assertMatter(ctx, data.matter_id);
  return data;
}

export async function updateMemory(ctx: AiCtx, id: string, patch: { content?: string; enabled?: boolean }) {
  await getOwnedMemory(ctx, id);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.userId };
  if (typeof patch.content === "string") update.content = checkMemoryContent(patch.content);
  if (typeof patch.enabled === "boolean") update.enabled = patch.enabled;
  const { data, error } = await db().from("ai_memories").update(update).eq("id", id).select(MEMORY_COLS).single();
  if (error) throw error;
  await audit(ctx, "memory.updated", "memory", id, null);
  return data as MemoryRow;
}

export async function deleteMemory(ctx: AiCtx, id: string) {
  await getOwnedMemory(ctx, id);
  const { error } = await db().from("ai_memories").delete().eq("id", id);
  if (error) throw error;
  await audit(ctx, "memory.deleted", "memory", id, null);
}

// Read fresh on every request (no cache), so edits, disables and deletes
// take effect on the very next message.
export async function memoriesForContext(ctx: AiCtx, matterId: string | null, question: string) {
  const all = await listMemories(ctx, matterId);
  const enabled = [...all.personal, ...all.firm, ...all.matter].filter((m) => m.enabled);
  if (enabled.length <= 30) return enabled;
  // Many memories: keep the ones sharing the most words with the question.
  const words = new Set((toSearchQuery(question) ?? "").split(" or ").filter(Boolean));
  return enabled
    .map((m) => ({ m, score: m.content.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((x) => x.m);
}

// ── Pending actions ───────────────────────────────────────────────────────

export type PendingAction = {
  id: string;
  tool: "createClient" | "createTask" | "saveDocumentDraft";
  args: Record<string, unknown>;
  args_hash: string;
  target_id: string;
  status: "pending" | "executing" | "executed" | "cancelled" | "failed";
  result: Record<string, unknown> | null;
  error: string | null;
  conversation_id: string;
  matter_id: string | null;
  user_id: string;
};

export async function createPendingAction(
  ctx: AiCtx,
  a: { conversationId: string; matterId: string | null; tool: PendingAction["tool"]; args: Record<string, unknown>; argsHash: string }
) {
  const { data, error } = await db()
    .from("ai_pending_actions")
    .insert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      conversation_id: a.conversationId,
      matter_id: a.matterId,
      tool: a.tool,
      args: a.args,
      args_hash: a.argsHash,
    })
    .select("id, target_id")
    .single();
  if (error) throw error;
  return data as { id: string; target_id: string };
}

export async function getPendingAction(ctx: AiCtx, id: string): Promise<PendingAction> {
  const { data } = await db()
    .from("ai_pending_actions")
    .select("id, tool, args, args_hash, target_id, status, result, error, conversation_id, matter_id, user_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId) // only the person the proposal was shown to
    .maybeSingle();
  if (!data) throw new AccessError(404, "This action isn't available.");
  return data as PendingAction;
}

// Atomic pending → executing transition: only one confirm can win.
export async function claimPendingAction(ctx: AiCtx, id: string) {
  const { data, error } = await db()
    .from("ai_pending_actions")
    .update({ status: "executing", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  return (data ?? []).length === 1;
}

export async function finishPendingAction(id: string, patch: { status: "executed" | "failed" | "cancelled"; result?: Record<string, unknown>; error?: string }) {
  await db().from("ai_pending_actions").update(patch).eq("id", id);
}

// ── Usage limits ──────────────────────────────────────────────────────────

export async function usageToday(ctx: AiCtx) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data, error } = await db()
    .from("ai_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", ctx.userId)
    .gte("created_at", since.toISOString())
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as { input_tokens: number; output_tokens: number }[];
  return { requests: rows.length, tokens: rows.reduce((n, r) => n + r.input_tokens + r.output_tokens, 0) };
}

export async function recordUsage(ctx: AiCtx, conversationId: string, model: string, inputTokens: number, outputTokens: number) {
  await db().from("ai_usage").insert({
    org_id: ctx.orgId,
    user_id: ctx.userId,
    conversation_id: conversationId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
}

// ── Audit (no content, just who/what/when) ────────────────────────────────

export async function audit(ctx: AiCtx, action: string, targetType: string | null, targetId: string | null, conversationId: string | null) {
  await db()
    .from("ai_audit_events")
    .insert({ org_id: ctx.orgId, user_id: ctx.userId, action, target_type: targetType, target_id: targetId, conversation_id: conversationId })
    .then(() => undefined, () => undefined);
}
