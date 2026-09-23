export type Citation = {
  id: string;
  kind: "document" | "attachment";
  documentId?: string;
  versionId?: string;
  fileId?: string;
  name: string;
  page: number | null;
  section: string | null;
};

export type ActionProposal = {
  id: string;
  tool: "createClient" | "createTask" | "saveDocumentDraft";
  args: Record<string, unknown>;
  matterTitle: string | null;
  status: "pending" | "executing" | "executed" | "cancelled" | "failed";
  result?: { recordId: string; label: string; href: string } | null;
  error?: string | null;
};

export type MemorySuggestion = { id: string; scope: "personal" | "firm" | "matter"; content: string; saved?: boolean; dismissed?: boolean };

export type MessageEvent =
  | { type: "action"; action: ActionProposal }
  | { type: "memory_suggestion"; suggestion: MemorySuggestion };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "interrupted" | "failed";
  error: string | null;
  citations: Citation[];
  events: MessageEvent[];
  attachment_ids: string[];
  created_at: string;
  activity?: string | null; // live tool activity while streaming
};

export type AttachedFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  status: "processing" | "ready" | "needs_ocr" | "failed" | "uploading";
  status_detail: string | null;
  page_count: number | null;
};

export type ConversationSummary = { id: string; title: string; matterId: string | null; matterTitle: string | null; updatedAt: string };

export function citationLabel(c: Citation) {
  const where = c.page ? `p. ${c.page}` : c.section ?? "";
  return where ? `${c.name}, ${where}` : c.name;
}
