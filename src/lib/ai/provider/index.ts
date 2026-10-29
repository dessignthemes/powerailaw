import "server-only";
import type { ChatProvider } from "@/lib/ai/provider/types";
import { AnthropicProvider } from "@/lib/ai/provider/anthropic";
import { OpenAIProvider } from "@/lib/ai/provider/openai";

// Supported model IDs. Override with AI_MODEL.
export const DEFAULT_MODELS = { anthropic: "claude-sonnet-5-5", openai: "gpt-5.5" } as const;
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
    // Per person per day: a safety net against runaway use, not a budget (the firm's
    // monthly allowance is AI_MONTHLY_TOKEN_LIMIT). Reading contracts or reviewing a
    // matter can use tens of thousands of tokens per request, so keep this generous.
    dailyTokenLimit: Math.max(1_500_000, Number(process.env.AI_DAILY_TOKEN_LIMIT) || 0),
    dailyRequestLimit: Math.max(400, Number(process.env.AI_DAILY_REQUEST_LIMIT) || 0),
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

// Shown when someone reaches the per-person daily safety limit.
export function dailyLimitMessage(used: { requests: number; tokens: number }) {
  const cfg = aiConfig();
  const reset = new Date();
  reset.setUTCHours(24, 0, 0, 0);
  const at = reset.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const what =
    used.requests >= cfg.dailyRequestLimit
      ? `${used.requests} of ${cfg.dailyRequestLimit} AI requests`
      : `${Math.round(used.tokens / 1000).toLocaleString("en-US")}k of ${Math.round(cfg.dailyTokenLimit / 1000).toLocaleString("en-US")}k AI tokens`;
  return `You've used today's personal AI limit (${what}). It resets at ${at} New York time. This is a daily safety limit, separate from the firm's monthly allowance.`;
}
