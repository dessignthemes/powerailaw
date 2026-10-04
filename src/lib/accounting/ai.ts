import "server-only";
import { getProvider } from "@/lib/ai/provider";
import { CATEGORIES, type Kind } from "@/lib/accounting/core";

// The AI only suggests; every suggestion lands in Review for a person.

const catList = CATEGORIES.filter((c) => c.key !== "uncategorized")
  .map((c) => `${c.key} (${c.kind}): ${c.label} — ${c.hint}`)
  .join("\n");

async function askJson(system: string, user: string, maxTokens = 3000): Promise<unknown | null> {
  const provider = getProvider();
  if (!provider) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let text = "";
  try {
    for await (const ev of provider.stream({
      system,
      messages: [{ role: "user", content: [{ type: "text", text: user }] }],
      tools: [],
      maxTokens,
      signal: controller.signal,
    })) {
      if (ev.type === "text") text += ev.delta;
    }
  } catch (e) {
    console.error("AI Accountant request failed:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
  const json = text.replace(/```json|```/g, "").trim();
  const start = json.search(/[[{]/);
  try {
    return JSON.parse(start >= 0 ? json.slice(start) : json);
  } catch {
    return null;
  }
}

const SYSTEM = `You are the bookkeeping assistant inside LawPower AI, a practice platform for US law firms.
You categorize a law firm's bank and card transactions so its outside accountant gets clean books.
Rules:
- Use only these category keys:
${catList}
- Payments from clients are legal_fees unless clearly a cost reimbursement. Court, filing, recording, expert, deposition, process-server and records fees paid for a case are client_costs.
- Card payments, transfers between the firm's own accounts and loan principal are transfer. ATM cash and obviously personal purchases are owner_draw.
- Westlaw, Lexis, Fastcase, Casetext are legal_research. Bar dues and state registrations are taxes_licenses. Malpractice carriers (ALPS, CNA, etc.) are insurance_malpractice.
- If you are unsure, use the closest category with a low confidence. Never invent facts.
Reply with JSON only, no prose.`;

export type Suggestion = { category: string; counterparty: string; confidence: number; reason: string };

// rows: [{i, date, description, amount, kind}] → suggestion per i
export async function categorize(rows: { i: number; date: string; description: string; amount: number; kind: Kind }[]): Promise<Map<number, Suggestion>> {
  const out = new Map<number, Suggestion>();
  const valid = new Set(CATEGORIES.map((c) => c.key));
  for (let start = 0; start < rows.length; start += 60) {
    const batch = rows.slice(start, start + 60);
    const res = await askJson(
      SYSTEM,
      `Categorize each transaction. Return {"items":[{"i":number,"category":"key","counterparty":"short clean payee/payer name","confidence":0-1,"reason":"max 12 words"}]}.\n\n${JSON.stringify(batch)}`
    );
    const items = (res as { items?: unknown[] } | null)?.items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const it = raw as Partial<Suggestion> & { i?: number };
      if (typeof it.i !== "number" || !valid.has(String(it.category))) continue;
      out.set(it.i, {
        category: String(it.category),
        counterparty: String(it.counterparty ?? "").slice(0, 200),
        confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0)),
        reason: String(it.reason ?? "").slice(0, 200),
      });
    }
  }
  return out;
}

export type ReceiptGuess = {
  date: string | null;
  counterparty: string;
  amount: number | null;
  category: string;
  description: string;
  confidence: number;
  reason: string;
};

export async function readReceipt(text: string): Promise<ReceiptGuess | null> {
  const res = (await askJson(
    SYSTEM,
    `This is the text of a receipt or vendor invoice paid by the firm. Return {"date":"YYYY-MM-DD or null","counterparty":"vendor","amount":total paid as a number or null,"category":"key","description":"what was bought, max 10 words","confidence":0-1,"reason":"max 12 words"}.\n\n${text.slice(0, 12000)}`,
    800
  )) as Partial<ReceiptGuess> | null;
  if (!res) return null;
  const valid = new Set(CATEGORIES.map((c) => c.key));
  const amount = Number(res.amount);
  return {
    date: typeof res.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(res.date) ? res.date : null,
    counterparty: String(res.counterparty ?? "").slice(0, 200),
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    category: valid.has(String(res.category)) ? String(res.category) : "uncategorized",
    description: String(res.description ?? "").slice(0, 300),
    confidence: Math.max(0, Math.min(1, Number(res.confidence) || 0)),
    reason: String(res.reason ?? "").slice(0, 200),
  };
}
