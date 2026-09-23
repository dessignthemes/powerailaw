import { NextResponse } from "next/server";
import { getProvider, aiConfig } from "@/lib/ai/provider";
import { ProviderError, type ChatMessage } from "@/lib/ai/provider/types";
import {
  getAiCtx,
  getConversation,
  createConversation,
  getMatterContext,
  listMessages,
  listConversationFiles,
  insertMessage,
  updateMessage,
  touchConversation,
  buildSearchScope,
  searchChunks,
  memoriesForContext,
  usageToday,
  recordUsage,
  type MatterContext,
} from "@/lib/ai/store";
import { buildSystemPrompt } from "@/lib/ai/context";
import { SourceRegistry, type AgentEvent, type Citation } from "@/lib/ai/tools";
import { runAgent } from "@/lib/ai/agent";
import { citedSourceIds } from "@/lib/ai/safety";
import { aiError } from "@/lib/ai/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_MESSAGE_CHARS = 20_000;
const HISTORY_MESSAGES = 20;

// POST { conversationId?, matterId?, message, attachmentIds? }
// Streams newline-delimited JSON events:
//   {type:"start", conversationId, userMessageId, assistantMessageId, title}
//   {type:"text", delta} | {type:"tool", ...} | {type:"action", ...} | {type:"memory_suggestion", ...}
//   {type:"citations", citations} | {type:"done", status} | {type:"error", message, code}
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await getAiCtx();
  } catch (e) {
    return aiError("POST /api/ai/chat", e);
  }

  const provider = getProvider();
  const cfg = aiConfig();
  if (!provider) {
    return NextResponse.json(
      { error: "The AI Agent isn't connected yet. Add ANTHROPIC_API_KEY to the server environment and redeploy.", code: "not_configured" },
      { status: 503 }
    );
  }

  let body: { conversationId?: string; matterId?: string | null; message?: string; attachmentIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = String(body.message ?? "").trim();
  if (!text) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  if (text.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: "That message is too long. Please shorten it." }, { status: 400 });

  let conv;
  let userMsg;
  let assistantMsg;
  let matter: MatterContext | null = null;
  try {
    const usage = await usageToday(ctx);
    if (usage.requests >= cfg.dailyRequestLimit || usage.tokens >= cfg.dailyTokenLimit) {
      return NextResponse.json(
        { error: "You've reached today's AI usage limit. It resets at midnight UTC.", code: "usage_limit" },
        { status: 429 }
      );
    }

    // The matter always comes from the stored conversation. A new
    // conversation's matter is checked against the user's org first.
    conv = body.conversationId ? await getConversation(ctx, body.conversationId) : await createConversation(ctx, body.matterId || null);

    const files = await listConversationFiles(ctx, conv.id);
    const attachmentIds = (body.attachmentIds ?? []).filter((id) => files.some((f) => f.id === id));

    userMsg = await insertMessage(ctx, conv.id, { role: "user", content: text, status: "complete", attachmentIds });
    assistantMsg = await insertMessage(ctx, conv.id, { role: "assistant", content: "", status: "streaming", model: provider.model });
    if (conv.title === "New chat") {
      const title = text.replace(/\s+/g, " ").slice(0, 60) + (text.length > 60 ? "…" : "");
      await touchConversation(conv.id, title);
      conv.title = title;
    } else await touchConversation(conv.id);

    if (conv.matter_id) matter = await getMatterContext(ctx, conv.matter_id);
  } catch (e) {
    return aiError("POST /api/ai/chat", e);
  }

  const convRow = conv;
  const assistantId = assistantMsg.id;
  const userMessageId = userMsg.id;
  const aborter = new AbortController();
  request.signal.addEventListener("abort", () => aborter.abort());
  // Hard ceiling so a stuck request can't run past the function limit.
  const hardTimeout = setTimeout(() => aborter.abort(new ProviderError("timeout", "The response took too long.")), (maxDuration - 8) * 1000);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };

      let partial = "";
      const events: AgentEvent[] = [];
      const sources = new SourceRegistry();

      send({ type: "start", conversationId: convRow.id, userMessageId, assistantMessageId: assistantId, title: convRow.title, matterId: convRow.matter_id });

      try {
        // Context: only this conversation's scope.
        const files = await listConversationFiles(ctx, convRow.id);
        const scope = await buildSearchScope(ctx, convRow, matter?.documents);
        const [excerpts, memories] = await Promise.all([searchChunks(ctx, scope, text, 6), memoriesForContext(ctx, convRow.matter_id, text)]);
        const pendingIndex = matter?.documents.filter((d) => !d.indexStatus).length ?? 0;

        const system = buildSystemPrompt({
          userEmail: ctx.email,
          matter,
          memories,
          files,
          excerpts,
          sources,
          indexingNote: pendingIndex ? `${pendingIndex} matter document(s) are still being prepared for search and aren't included yet.` : null,
        });

        // Recent history as plain text (earlier tool traffic isn't replayed).
        const history = (await listMessages(ctx, convRow.id))
          .filter((m) => m.id !== assistantId && m.id !== userMessageId && m.content.trim() && m.status !== "failed")
          .slice(-HISTORY_MESSAGES);
        const messages: ChatMessage[] = [];
        for (const m of history) {
          const last = messages[messages.length - 1];
          const block = { type: "text" as const, text: m.status === "interrupted" ? `${m.content}\n[response was interrupted]` : m.content };
          if (last && last.role === m.role) last.content.push(block);
          else messages.push({ role: m.role, content: [block] });
        }
        if (messages[0]?.role === "assistant") messages.shift();
        const last = messages[messages.length - 1];
        if (last?.role === "user") last.content.push({ type: "text", text });
        else messages.push({ role: "user", content: [{ type: "text", text }] });

        const result = await runAgent({
          provider,
          system,
          messages,
          maxTokens: cfg.maxOutputTokens,
          signal: aborter.signal,
          toolCtx: {
            ctx,
            conv: convRow,
            matter,
            scope,
            sources,
            emit: (e) => {
              events.push(e);
              send(e);
            },
          },
          onText: (d) => {
            partial += d;
            send({ type: "text", delta: d });
          },
        });

        // Remove any [S#] marker that doesn't match a source we actually
        // provided, so an invented reference can't appear in the answer.
        const finalText = result.text.replace(/\s?\[(S\d{1,3})\]/g, (m, id) => (sources.get(id) ? m : ""));
        if (finalText !== result.text) send({ type: "final_text", text: finalText });

        // Keep only citations the answer actually uses, and only real sources.
        const citations: Citation[] = citedSourceIds(finalText)
          .map((id) => sources.get(id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map(({ content: _c, ...c }) => {
            void _c;
            return c;
          });
        send({ type: "citations", citations });

        const truncated = result.stopReason === "max_tokens";
        await updateMessage(assistantId, {
          content: finalText,
          status: "complete",
          error: truncated ? "The answer hit the length limit and may be cut short." : null,
          citations,
          events: events.filter((e) => e.type !== "tool"),
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        });
        await recordUsage(ctx, convRow.id, provider.model, result.inputTokens, result.outputTokens);
        send({ type: "done", status: "complete", truncated });
      } catch (e) {
        const pe = e instanceof ProviderError ? e : aborter.signal.aborted ? new ProviderError("aborted", "Stopped.") : null;
        const interrupted = pe?.code === "aborted" && !(aborter.signal.reason instanceof ProviderError);
        const message = interrupted
          ? "Stopped."
          : pe?.message ?? "Something went wrong while generating the answer. Please try again.";
        if (!pe) {
          const err = e as { name?: string; code?: string };
          console.error(`AI chat failed: ${err?.name ?? "Error"} ${err?.code ?? ""}`.trim());
        }
        await updateMessage(assistantId, {
          content: partial,
          status: interrupted ? "interrupted" : "failed",
          error: message,
          events: events.filter((ev) => ev.type !== "tool"),
        }).catch(() => undefined);
        send({ type: interrupted ? "done" : "error", status: interrupted ? "interrupted" : "failed", message, code: pe?.code });
      } finally {
        clearTimeout(hardTimeout);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting
        }
      }
    },
    cancel() {
      aborter.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
