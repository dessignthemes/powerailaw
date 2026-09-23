import "server-only";
import type { ChatProvider } from "@/lib/ai/provider/types";
import { AnthropicProvider } from "@/lib/ai/provider/anthropic";

// Supported model ID (Anthropic API). Override with AI_MODEL.
export const DEFAULT_MODEL = "claude-sonnet-5";

export function aiConfig() {
  return {
    provider: (process.env.AI_PROVIDER || "anthropic").toLowerCase(),
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    configured: !!process.env.ANTHROPIC_API_KEY,
    timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 60_000,
    maxRetries: Math.min(Number(process.env.AI_MAX_RETRIES ?? 2), 4),
    dailyTokenLimit: Number(process.env.AI_DAILY_TOKEN_LIMIT) || 300_000,
    dailyRequestLimit: Number(process.env.AI_DAILY_REQUEST_LIMIT) || 150,
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS) || 4096,
  };
}

// Returns null when credentials are missing — callers must show a setup
// state, never a placeholder answer.
export function getProvider(overrides?: { fetch?: typeof fetch }): ChatProvider | null {
  const cfg = aiConfig();
  if (cfg.provider !== "anthropic") {
    // Only Anthropic is implemented today; Bedrock would be added here.
    return null;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new AnthropicProvider(key, cfg.model, { timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries, fetch: overrides?.fetch });
}
