// Provider-neutral chat types. Chat, memory and tools only depend on this
// file, so another provider (e.g. Amazon Bedrock's Converse API, which uses
// the same text / tool_use / tool_result shape) can be added as a second
// implementation of ChatProvider without touching them.

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type ChatMessage = { role: "user" | "assistant"; content: ContentBlock[] };

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
};

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxTokens: number;
  signal: AbortSignal;
};

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export type ProviderEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use"; block: ToolUseBlock }
  | { type: "done"; stopReason: StopReason; usage: { inputTokens: number; outputTokens: number } };

export type ProviderErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "aborted"
  | "bad_request"
  | "unavailable";

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string) {
    super(message);
  }
}

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  stream(req: ChatRequest): AsyncGenerator<ProviderEvent>;
}
