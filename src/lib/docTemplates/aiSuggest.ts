import "server-only";
import { getProvider, aiConfig } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/usage";
import { usageToday, type AiCtx } from "@/lib/ai/store";
import { VOCABULARY, countIn, type FieldType, type Suggestion } from "@/lib/docTemplates/vocabulary";

// Template maker → "Find fields with AI": names, parties, the court, property,
// amounts… the parts that change from one matter to the next. Suggestions only;
// the attorney decides. Uses the same AI provider (no training on firm data).
const SYSTEM = `You help a law firm turn one of its finished documents into a reusable template.
Find the pieces of text that would change for a different client or matter: people's and companies' names, addresses, property descriptions, amounts, dates, the court, docket numbers, the opposing party or counsel, lender, title company, etc.
Do NOT pick standard legal wording, statute citations, or the firm's own name, address or attorney signature block.
For each, copy the text EXACTLY as it appears in the document (same spelling, capitals and punctuation), and give it a field key. Prefer these shared keys when they fit: ${VOCABULARY.map((v) => v.key).join(", ")}. Otherwise make a short snake_case key.
Types: text, date, currency, number.
Reply with JSON only:
{"fields":[{"text":"John Smith","key":"client_name","label":"Client name","type":"text","why":"the buyer, appears in the parties and signature lines"}]}`;

export async function aiSuggestions(ctx: AiCtx, paragraphs: string[]): Promise<Suggestion[]> {
  const provider = getProvider();
  if (!provider) throw new Error("AI isn't set up for this workspace.");
  const cfg = aiConfig();
  const u = await usageToday(ctx);
  if (u.requests >= cfg.dailyRequestLimit || u.tokens >= cfg.dailyTokenLimit) throw new Error("Today's AI limit has been reached. Try again tomorrow, or mark the fields by hand.");
  const text = paragraphs.join("\n").slice(0, 45000);
  let out = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    for await (const ev of provider.stream({ system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text }] }], tools: [], maxTokens: 4000, signal: ctl.signal })) {
      if (ev.type === "text") out += ev.delta;
      if (ev.type === "done") usage = ev.usage;
    }
  } finally {
    clearTimeout(timer);
  }
  await recordAiUsage({ orgId: ctx.orgId, userId: ctx.userId, feature: "documents", model: provider.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const raw = (JSON.parse(json || "{}") as { fields?: { text?: unknown; key?: unknown; label?: unknown; type?: unknown; why?: unknown }[] }).fields ?? [];
  const seen = new Set<string>();
  const res: Suggestion[] = [];
  for (const f of raw) {
    const t = String(f.text ?? "").trim();
    const count = countIn(paragraphs, t);
    if (t.length < 2 || !count || seen.has(t) || t.includes("{{")) continue; // must really be in the document
    seen.add(t);
    const key = String(f.key ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "field";
    const type = (["text", "date", "currency", "number"].includes(String(f.type)) ? f.type : "text") as FieldType;
    res.push({ text: t, count, key: /^[a-z]/.test(key) ? key : `f_${key}`, label: String(f.label ?? key).slice(0, 80), type, source: "ai", why: String(f.why ?? "").slice(0, 200) });
  }
  return res.slice(0, 60);
}
