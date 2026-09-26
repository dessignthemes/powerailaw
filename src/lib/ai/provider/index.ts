import "server-only";
import type { ChatProvider } from "@/lib/ai/provider/types";
import { AnthropicProvider } from "@/lib/ai/provider/anthropic";
import { OpenAIProvider } from "@/lib/ai/provider/openai";

// Supported model IDs. Override with AI_MODEL.
export const DEFAULT_MODELS = { anthropic: "claude-sonnet-5", openai: "gpt-5.5" } as const;
export type ProviderName = keyof typeof DEFAULT_MODELS;

export const PROVIDER_LABEL: Record<ProviderName, string> = { anthropic: "Anthropic", openai: "OpenAI" };

export function aiConfig() {
  const raw = (process.env.AI_PROVIDER || "").toLowerCase();
  // Explicit AI_PROVIDER wins; otherwise use whichever key is present (Anthropic first).
  const provider: ProviderName =
    raw === "openai" || raw === "anthropic"
      ? raw
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : process.env.OPENAI_API_KEY
          ? "openai"
          : "anthropic";
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return {
    provider,
    providerLabel: PROVIDER_LABEL[provider],
    keyName: provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY",
    model: process.env.AI_MODEL || DEFAULT_MODELS[provider],
    configured: !!key,
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
  const opts = { timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries, fetch: overrides?.fetch };
  if (cfg.provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    return key ? new OpenAIProvider(key, cfg.model, opts) : null;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicProvider(key, cfg.model, opts) : null;
}
