# AI Agent — setup and behaviour

## Setup
1. Run `supabase/migrations/0005_ai_agent.sql` in the Supabase SQL editor (after 0001–0004).
   It creates the AI tables with row-level security, the `ai_search_chunks` search function
   (callable only by the server), and the private `ai-attachments` storage bucket.
2. In Vercel → Settings → Environment Variables, add `ANTHROPIC_API_KEY` (create one at
   console.anthropic.com). Optionally set `AI_MODEL` and the limits listed in `.env.example`.
3. Redeploy. Until the key is set the AI Agent page shows a setup notice and chat is disabled.

## How it works
- **Provider**: Anthropic Claude via the official `@anthropic-ai/sdk`, server-side only
  (`src/lib/ai/provider`). `ChatProvider` is provider-neutral so Amazon Bedrock can be added as a
  second implementation without changing chat, memory or tools.
- **Conversations** are private to the user who created them and fixed to one matter (or none).
  The matter always comes from the stored conversation, never from the browser.
- **Retrieval**: Postgres full-text search over text chunks (`ai_chunks`). No embedding provider.
  Matter chats search that matter's latest document versions plus the chat's attachments;
  general chats search only their own attachments.
- **Citations**: excerpts are labelled `[S#]`; PDFs keep real page numbers, DOCX uses headings and
  paragraph ranges, TXT uses line ranges. Markers that don't match a provided source are removed.
- **Documents**: PDF, DOCX, TXT up to 15 MB, type checked from the file bytes. Scanned PDFs are
  marked "needs OCR" — there is no OCR service configured, so they are not analysed.
- **Tools**: `getMatterSummary`, `searchDocuments`, `listMatterTasks` run immediately within the
  conversation's scope. `createClient`, `createTask`, `saveDocumentDraft` only create a proposal
  bound to the user and a hash of the exact arguments; `POST /api/ai/actions/:id` executes it once,
  using a pre-assigned record id so retries can't duplicate. Max 8 tool calls per message.
- **Memory**: personal / firm / matter. Suggestions need approval. Credentials and sensitive
  identifiers are rejected. Memory is read fresh on every request, so edits and deletions apply
  immediately (there is no cache or embedding index to go stale).
- **Prompt injection**: document text is wrapped as untrusted data, and write actions can only be
  executed by the user's confirmation, so instructions in documents can't create records.

## Data handling and retention
- Messages, relevant excerpts and the selected matter's details are sent to Anthropic's API.
  See Anthropic's commercial terms for their retention; nothing in the app promises zero retention.
- Deleting a conversation deletes its messages, attachments (storage objects), their text chunks
  and any pending proposals. Usage counts (`ai_usage`) and audit events (`ai_audit_events`, no
  content) are kept.
- Matter document text chunks are deleted when the document version is deleted. Power PDF has no
  delete button yet, so matter documents (and their chunks) currently persist.
- Application logs record error types only — not prompts, messages or document text.
