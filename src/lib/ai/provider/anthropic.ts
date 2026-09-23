import "server-only";
import Anthropic, {
  APIUserAbortError,
  APIConnectionTimeoutError,
  APIConnectionError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  BadRequestError,
  APIError,
} from "@anthropic-ai/sdk";
import type { ChatProvider, ChatRequest, ContentBlock, ProviderEvent, StopReason, ToolUseBlock } from "@/lib/ai/provider/types";
import { ProviderError } from "@/lib/ai/provider/types";

function toAnthropicContent(blocks: ContentBlock[]): Anthropic.ContentBlockParam[] {
  return blocks.map((b) => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError ?? false };
  });
}

function mapStop(r: string | null | undefined): StopReason {
  if (r === "end_turn" || r === "tool_use" || r === "max_tokens" || r === "refusal") return r;
  return "other";
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof APIUserAbortError) return new ProviderError("aborted", "Stopped.");
  if (err instanceof APIConnectionTimeoutError) return new ProviderError("timeout", "The AI service took too long to respond. Please try again.");
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError)
    return new ProviderError("auth", "The AI service rejected the API key. Check ANTHROPIC_API_KEY on the server.");
  if (err instanceof RateLimitError) return new ProviderError("rate_limited", "The AI service is rate-limiting requests right now. Please wait a moment and try again.");
  if (err instanceof BadRequestError) return new ProviderError("bad_request", "The AI service couldn't process this request. Try a shorter message or fewer attachments.");
  if (err instanceof APIError && (err.status === 529 || err.status === 503))
    return new ProviderError("overloaded", "The AI service is busy right now. Please try again shortly.");
  if (err instanceof APIConnectionError) return new ProviderError("unavailable", "Couldn't reach the AI service. Please try again.");
  if (err instanceof APIError) return new ProviderError("unavailable", `The AI service returned an error (${err.status ?? "unknown"}). Please try again.`);
  return new ProviderError("unavailable", "Something went wrong talking to the AI service.");
}

export class AnthropicProvider implements ChatProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string, opts: { timeoutMs: number; maxRetries: number; fetch?: typeof fetch }) {
    // The SDK retries connection errors, 408/409/429 and 5xx with backoff,
    // up to maxRetries; timeout applies per attempt.
    this.client = new Anthropic({ apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries, fetch: opts.fetch });
  }

  async *stream(req: ChatRequest): AsyncGenerator<ProviderEvent> {
    let stream;
    try {
      stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
          tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
          stream: true,
        },
        { signal: req.signal }
      );
    } catch (err) {
      throw mapError(err);
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let stop: StopReason = "other";
    const toolBuf = new Map<number, { id: string; name: string; json: string }>();

    try {
      for await (const ev of stream) {
        if (ev.type === "message_start") {
          inputTokens = ev.message.usage?.input_tokens ?? 0;
          outputTokens = ev.message.usage?.output_tokens ?? 0;
        } else if (ev.type === "content_block_start") {
          if (ev.content_block.type === "tool_use") {
            toolBuf.set(ev.index, { id: ev.content_block.id, name: ev.content_block.name, json: "" });
          }
        } else if (ev.type === "content_block_delta") {
          if (ev.delta.type === "text_delta") yield { type: "text", delta: ev.delta.text };
          else if (ev.delta.type === "input_json_delta") {
            const t = toolBuf.get(ev.index);
            if (t) t.json += ev.delta.partial_json;
          }
        } else if (ev.type === "content_block_stop") {
          const t = toolBuf.get(ev.index);
          if (t) {
            let input: Record<string, unknown> = {};
            try {
              input = t.json ? JSON.parse(t.json) : {};
            } catch {
              input = { __invalid_json: true };
            }
            const block: ToolUseBlock = { type: "tool_use", id: t.id, name: t.name, input };
            yield { type: "tool_use", block };
            toolBuf.delete(ev.index);
          }
        } else if (ev.type === "message_delta") {
          stop = mapStop(ev.delta.stop_reason);
          if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
          if (ev.usage?.input_tokens != null) inputTokens = ev.usage.input_tokens;
        }
      }
    } catch (err) {
      throw mapError(err);
    }

    yield { type: "done", stopReason: stop, usage: { inputTokens, outputTokens } };
  }
}
