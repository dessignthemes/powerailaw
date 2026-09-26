import "server-only";
import OpenAI from "openai";
import type { ChatProvider, ChatRequest, ChatMessage, ProviderEvent, StopReason, ToolUseBlock } from "@/lib/ai/provider/types";
import { ProviderError } from "@/lib/ai/provider/types";

type OAMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Provider-neutral messages → OpenAI Chat Completions messages.
function toOpenAI(system: string, messages: ChatMessage[]): OAMessage[] {
  const out: OAMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const calls = m.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length
          ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) }
          : {}),
      });
      continue;
    }
    // user turn: tool results become "tool" messages; text stays a user message
    const text: string[] = [];
    for (const b of m.content) {
      if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.toolUseId, content: b.content });
      else if (b.type === "text") text.push(b.text);
    }
    if (text.length) out.push({ role: "user", content: text.join("\n\n") });
  }
  return out;
}

function mapStop(r: string | null | undefined): StopReason {
  if (r === "stop") return "end_turn";
  if (r === "tool_calls" || r === "function_call") return "tool_use";
  if (r === "length") return "max_tokens";
  if (r === "content_filter") return "refusal";
  return "other";
}

function mapError(err: unknown, model: string): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.APIUserAbortError) return new ProviderError("aborted", "Stopped.");
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError("timeout", "The AI service took too long to respond. Please try again.");
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError)
    return new ProviderError("auth", "OpenAI rejected the API key. Check OPENAI_API_KEY on the server (and that the account has billing set up).");
  if (err instanceof OpenAI.RateLimitError)
    return new ProviderError("rate_limited", "OpenAI is rate-limiting requests or the account is out of credit. Please wait and try again, or check your OpenAI billing.");
  if (err instanceof OpenAI.NotFoundError)
    return new ProviderError("bad_request", `The model "${model}" isn't available on this OpenAI account. Set AI_MODEL to a model your account can use.`);
  if (err instanceof OpenAI.BadRequestError) return new ProviderError("bad_request", "OpenAI couldn't process this request. Try a shorter message or fewer attachments.");
  if (err instanceof OpenAI.APIError && (err.status === 503 || err.status === 529))
    return new ProviderError("overloaded", "OpenAI is busy right now. Please try again shortly.");
  if (err instanceof OpenAI.APIConnectionError) return new ProviderError("unavailable", "Couldn't reach OpenAI. Please try again.");
  if (err instanceof OpenAI.APIError) return new ProviderError("unavailable", `OpenAI returned an error (${err.status ?? "unknown"}). Please try again.`);
  return new ProviderError("unavailable", "Something went wrong talking to the AI service.");
}

export class OpenAIProvider implements ChatProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string, opts: { timeoutMs: number; maxRetries: number; fetch?: typeof fetch }) {
    this.client = new OpenAI({ apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries, fetch: opts.fetch });
  }

  async *stream(req: ChatRequest): AsyncGenerator<ProviderEvent> {
    let stream;
    try {
      stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: toOpenAI(req.system, req.messages),
          tools: req.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          max_completion_tokens: req.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: req.signal }
      );
    } catch (err) {
      throw mapError(err, this.model);
    }

    let stop: StopReason = "other";
    let inputTokens = 0;
    let outputTokens = 0;
    const calls = new Map<number, { id: string; name: string; args: string }>();

    try {
      for await (const chunk of stream) {
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const d = choice.delta;
        if (d?.content) yield { type: "text", delta: d.content };
        for (const tc of d?.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(tc.index, cur);
        }
        if (choice.finish_reason) stop = mapStop(choice.finish_reason);
      }
    } catch (err) {
      throw mapError(err, this.model);
    }

    for (const [, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
      let input: Record<string, unknown> = {};
      try {
        input = c.args ? JSON.parse(c.args) : {};
      } catch {
        input = { __invalid_json: true };
      }
      yield { type: "tool_use", block: { type: "tool_use", id: c.id || `call_${crypto.randomUUID()}`, name: c.name, input } };
    }
    if (calls.size > 0 && stop !== "max_tokens") stop = "tool_use";
    yield { type: "done", stopReason: stop, usage: { inputTokens, outputTokens } };
  }
}
