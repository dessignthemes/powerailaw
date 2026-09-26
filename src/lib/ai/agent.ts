import "server-only";
import type { ChatMessage, ChatProvider, ContentBlock, ToolUseBlock } from "@/lib/ai/provider/types";
import { ProviderError } from "@/lib/ai/provider/types";
import { runTool, toolSpecs, type ToolContext } from "@/lib/ai/tools";

export const MAX_ROUNDS = 5; // model turns per request
export const MAX_TOOL_CALLS = 8; // tool executions per request

export type AgentStreamEvent = { type: "text"; delta: string };

export type AgentResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
};

// Runs the model with tools until it stops asking for them, streaming text
// through onText. Tool calls beyond the cap get an error result instead.
export async function runAgent(opts: {
  provider: ChatProvider;
  system: string;
  messages: ChatMessage[];
  toolCtx: ToolContext;
  maxTokens: number;
  signal: AbortSignal;
  onText: (delta: string) => void;
}): Promise<AgentResult> {
  const messages = [...opts.messages];
  const tools = toolSpecs();
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  let stopReason = "end_turn";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const roundText: string[] = [];
    const uses: ToolUseBlock[] = [];
    let firstDelta = true;

    for await (const ev of opts.provider.stream({
      system: opts.system,
      messages,
      tools,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    })) {
      if (ev.type === "text") {
        // One paragraph break between text from an earlier round and this
        // round's text, decided on this round's first fragment only.
        if (firstDelta && text && round > 0) {
          text += "\n\n";
          opts.onText("\n\n");
        }
        firstDelta = false;
        roundText.push(ev.delta);
        text += ev.delta;
        opts.onText(ev.delta);
      } else if (ev.type === "tool_use") {
        uses.push(ev.block);
      } else if (ev.type === "done") {
        inputTokens += ev.usage.inputTokens;
        outputTokens += ev.usage.outputTokens;
        stopReason = ev.stopReason;
      }
    }

    if (stopReason !== "tool_use" || uses.length === 0) break;

    const assistant: ContentBlock[] = [];
    if (roundText.join("")) assistant.push({ type: "text", text: roundText.join("") });
    assistant.push(...uses);
    messages.push({ role: "assistant", content: assistant });

    const results: ContentBlock[] = [];
    for (const u of uses) {
      if (opts.signal.aborted) throw new ProviderError("aborted", "Stopped.");
      if (toolCalls >= MAX_TOOL_CALLS) {
        results.push({ type: "tool_result", toolUseId: u.id, content: JSON.stringify({ error: "Tool limit for this message reached. Answer with what you have." }), isError: true });
        continue;
      }
      toolCalls++;
      opts.toolCtx.emit({ type: "tool", name: u.name, status: "running" });
      let r: { content: string; isError: boolean };
      try {
        r = await runTool(opts.toolCtx, u.name, u.input);
      } catch {
        r = { content: JSON.stringify({ error: "The tool failed. Tell the user it couldn't be completed." }), isError: true };
      }
      opts.toolCtx.emit({ type: "tool", name: u.name, status: r.isError ? "error" : "done" });
      results.push({ type: "tool_result", toolUseId: u.id, content: r.content, isError: r.isError });
    }
    messages.push({ role: "user", content: results });

    if (round === MAX_ROUNDS - 1) stopReason = "max_rounds";
  }

  return { text, inputTokens, outputTokens, stopReason };
}
