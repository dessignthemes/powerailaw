// Checklist templates and task checklists (shared by browser and server).

// anchor = the critical date the step hangs off (e.g. "Closing date"); days = +/- days from it.
export type TemplateItem = { id: string; text: string; anchor?: string; days?: number };
export type TemplateSection = { id: string; title: string; items: TemplateItem[] };
export type TaskTemplate = { id: string; name: string; sections: TemplateSection[]; updatedAt?: string };

export type ChecklistItem = { id: string; text: string; done: boolean; doneAt?: string | null; anchor?: string; days?: number };
export type ChecklistSection = { id: string; title: string; items: ChecklistItem[] };
// dates = the task's critical dates ("Closing date" -> "2026-11-20"), used to work out each step's due date.
export type TaskChecklist = { templates: string[]; sections: ChecklistSection[]; dates?: Record<string, string> };

export const MAX_SECTIONS = 30;
export const MAX_ITEMS = 60; // per section
const MAX_TEXT = 200;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

const clean = (v: unknown, max = MAX_TEXT) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanAnchor = (v: unknown) => clean(v, 60);
const cleanDays = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(-730, Math.min(730, n)) : 0;
};
// Optional date fields on an item: only kept when a critical date is named.
const timing = (it: { anchor?: unknown; days?: unknown }) => {
  const anchor = cleanAnchor(it.anchor);
  return anchor ? { anchor, days: cleanDays(it.days) } : {};
};

// Keeps only well-formed sections/items (used for anything coming from the browser or the database).
export function cleanSections(input: unknown): TemplateSection[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_SECTIONS).map((s) => {
    const sec = (s ?? {}) as { id?: unknown; title?: unknown; items?: unknown };
    const items = Array.isArray(sec.items) ? sec.items : [];
    return {
      id: clean(sec.id, 64) || newId(),
      title: clean(sec.title, 120),
      items: items
        .slice(0, MAX_ITEMS)
        .map((i) => {
          const it = (i ?? {}) as { id?: unknown; text?: unknown; anchor?: unknown; days?: unknown };
          return { id: clean(it.id, 64) || newId(), text: clean(it.text), ...timing(it) };
        })
        .filter((i) => i.text),
    };
  });
}

export function cleanChecklist(input: unknown): TaskChecklist | null {
  if (!input || typeof input !== "object") return null;
  const c = input as { templates?: unknown; sections?: unknown };
  const raw = Array.isArray(c.sections) ? c.sections : [];
  const sections: ChecklistSection[] = raw.slice(0, MAX_SECTIONS * 3).map((s) => {
    const sec = (s ?? {}) as { id?: unknown; title?: unknown; items?: unknown };
    const items = Array.isArray(sec.items) ? sec.items : [];
    return {
      id: clean(sec.id, 64) || newId(),
      title: clean(sec.title, 120),
      items: items.slice(0, MAX_ITEMS * 2).map((i) => {
        const it = (i ?? {}) as { id?: unknown; text?: unknown; done?: unknown; doneAt?: unknown; anchor?: unknown; days?: unknown };
        const done = it.done === true;
        return { id: clean(it.id, 64) || newId(), text: clean(it.text), done, doneAt: done ? clean(it.doneAt, 40) || null : null, ...timing(it) };
      }).filter((i) => i.text),
    };
  });
  const templates = Array.isArray(c.templates) ? c.templates.slice(0, 20).map((t) => clean(t, 80)).filter(Boolean) : [];
  if (!sections.length) return null;
  const dates: Record<string, string> = {};
  if (c && typeof (c as { dates?: unknown }).dates === "object" && (c as { dates?: unknown }).dates) {
    for (const [k, v] of Object.entries((c as { dates: Record<string, unknown> }).dates).slice(0, 40)) {
      const key = cleanAnchor(k);
      if (key && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) dates[key] = v;
    }
  }
  return { templates, sections, ...(Object.keys(dates).length ? { dates } : {}) };
}

// Adds a template's sections to a task's checklist (fresh, unticked items).
export function applyTemplate(current: TaskChecklist | null | undefined, t: TaskTemplate): TaskChecklist {
  const added: ChecklistSection[] = t.sections.map((s) => ({
    id: newId(),
    title: s.title,
    items: s.items.map((i) => ({ id: newId(), text: i.text, done: false, doneAt: null, ...(i.anchor ? { anchor: i.anchor, days: i.days ?? 0 } : {}) })),
  }));
  return {
    templates: [...(current?.templates ?? []), t.name],
    sections: [...(current?.sections ?? []), ...added],
    ...(current?.dates ? { dates: current.dates } : {}),
  };
}

export function progress(c: TaskChecklist | null | undefined) {
  let total = 0;
  let done = 0;
  for (const s of c?.sections ?? []) for (const i of s.items) {
    total++;
    if (i.done) done++;
  }
  return { total, done };
}

// Turns pasted text into sections: a plain line starts a section, "* item" / "- item" / "• item" lines are its items.
export function parseOutline(text: string): TemplateSection[] {
  const sections: TemplateSection[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const item = /^([*\-•▪◦]|\[ ?\]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      if (!sections.length) sections.push({ id: newId(), title: "", items: [] });
      const [text, anchor, days] = item[2].split("|").map((x) => x.trim());
      const t = clean(text);
      if (t) sections[sections.length - 1].items.push({ id: newId(), text: t, ...timing({ anchor, days: days?.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[^\d-]/g, "") }) });
    } else if (!/^checklist$/i.test(line)) {
      sections.push({ id: newId(), title: clean(line, 120), items: [] });
    }
  }
  return sections.filter((s) => s.items.length || s.title).slice(0, MAX_SECTIONS);
}

export function toOutline(sections: TemplateSection[]): string {
  return sections
    .map((s) => [s.title, ...s.items.map((i) => (i.anchor ? `* ${i.text} | ${i.anchor} | ${fmtDays(i.days ?? 0)}` : `* ${i.text}`))].join("\n"))
    .join("\n\n");
}

// Ready-made starter so a firm doesn't have to type it in.
export const REAL_ESTATE_PURCHASE = `Intake & Engagement
* Date Contract Signed
* Legal Service Agreement Sent Out
* Legal Service Agreement Received
* Intake Form Completed
* Invoice Sent Out
* Invoice Sent Out

Attorney Review
* Review Letter Sent Out
* Review Letter Received
* Review Letter Response
* Attorney Review Concluded

Deposits & Escrow
* 1st Deposit Received
* 2nd Deposit Received
* Escrow Letter
* Escrow Held?
* Fee Received

Inspection & Contingencies
* Contingency Date Letter
* Home Inspection Report Received
* Home Inspection Letter Sent Out
* Home Inspection Contingency Satisfied

Mortgage & Title
* Mortgage Commitment Received
* Title Ordered
* Title Binder Received
* Appraisal
* Survey
* Certificate of Occupancy
* Smoke Cert
* Final Water/Sewer Read

Closing Preparation
* Realtor Commission Statement
* Cleared to Close
* Closing Scheduled
* Deposit Checks Cut

Post Closing
* Recorded Deed
* Owners Title Policy
* File Completed`;

// ---------------------------------------------------------------------------
// Due dates: each timed step is due <days> after (or before) one of the task's critical dates.
// ---------------------------------------------------------------------------
export const fmtDays = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `\u2212${Math.abs(d)}` : "0");

export const COMMON_ANCHORS = [
  "Engagement date",
  "Contract signed date",
  "Attorney review completed date",
  "Second deposit due date",
  "Mortgage contingency date",
  "Closing Disclosure issue date",
  "Closing date",
  "File complete date",
  "Not proceeding date",
];

// Critical dates used by a checklist, in the order they first appear.
export function anchorsOf(c: TaskChecklist | null | undefined): string[] {
  const seen: string[] = [];
  for (const s of c?.sections ?? []) for (const i of s.items) if (i.anchor && !seen.includes(i.anchor)) seen.push(i.anchor);
  return seen;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function dueDateOf(item: ChecklistItem, dates: Record<string, string> | undefined): string | null {
  const base = item.anchor ? dates?.[item.anchor] : undefined;
  if (!base) return null;
  const [y, m, d] = base.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + (item.days ?? 0)));
}

export type DueState = "none" | "unset" | "done" | "overdue" | "today" | "soon" | "later";

// soon = due within the next 3 days.
export function dueState(item: ChecklistItem, dates: Record<string, string> | undefined, today = ymd(new Date())): { state: DueState; due: string | null } {
  if (!item.anchor) return { state: "none", due: null };
  const due = dueDateOf(item, dates);
  if (item.done) return { state: "done", due };
  if (!due) return { state: "unset", due: null };
  if (due < today) return { state: "overdue", due };
  if (due === today) return { state: "today", due };
  const [y, m, d] = today.split("-").map(Number);
  return { state: due <= ymd(new Date(y, m - 1, d + 3)) ? "soon" : "later", due };
}

export function alerts(c: TaskChecklist | null | undefined) {
  let overdue = 0;
  let soon = 0;
  for (const s of c?.sections ?? []) for (const i of s.items) {
    const st = dueState(i, c?.dates).state;
    if (st === "overdue") overdue++;
    else if (st === "today" || st === "soon") soon++;
  }
  return { overdue, soon };
}

// Ready-made NJ workflows (step | critical date | days +/-).
export const RE_PURCHASE_NJ = `Engagement
* Initial Fee Received | Engagement date | 0
* Intake Form Completed | Engagement date | 0
* Legal Service Agreement Received | Engagement date | 0
* Legal Service Agreement Sent Out | Engagement date | 0
* Review Letter Received | Engagement date | 0
* Review Letter Sent Out | Engagement date | 0
* Fee Received | Engagement date | +1
* Review Letter Response | Engagement date | +1

Contract Signed
* Date Contract Signed | Contract signed date | 0

Attorney Review Completed
* Attorney Review Concluded | Attorney review completed date | 0
* Contingency Date Letter | Attorney review completed date | 0
* 1st Deposit Received | Attorney review completed date | +3
* 2nd Deposit Received | Attorney review completed date | +10
* Home Inspection Letter Sent Out | Attorney review completed date | +10
* Home Inspection Report Received | Attorney review completed date | +10
* Appraisal | Attorney review completed date | +14
* Home Inspection Contingency Satisfied | Attorney review completed date | +14
* Survey | Attorney review completed date | +15
* Title Ordered | Attorney review completed date | +15

Second Deposit
* Escrow Letter | Second deposit due date | 0

Mortgage Contingency
* Mortgage Commitment Received | Mortgage contingency date | 0

Closing Disclosure
* Realtor Commission Statement | Closing Disclosure issue date | -3

Closing
* Title Binder Received | Closing date | -14
* Certificate of Occupancy | Closing date | -10
* Final Water/Sewer Read | Closing date | -10
* Smoke Cert | Closing date | -10
* Cleared to Close | Closing date | -5
* Closing Scheduled | Closing date | -3
* Deposit Checks Cut | Closing date | -1
* Escrow Held? | Closing date | 0

Post Closing
* Owners Title Policy | Closing date | +90
* Recorded Deed | Closing date | +90
* File Completed | File complete date | 0

Not Proceeding
* Not Proceeding | Not proceeding date | 0`;

export const RE_SALE_NJ = `Engagement
* Intake Form Completed | Engagement date | 0
* Legal Service Agreement Received | Engagement date | 0
* Legal Service Agreement Sent Out | Engagement date | 0
* Review Letter Sent Out | Engagement date | 0
* Review Letter Received | Engagement date | +1
* Review Letter Response | Engagement date | +1
* Fee Received | Engagement date | +2
* Initial Fee Received | Engagement date | +2

Contract Signed
* Date Contract Signed | Contract signed date | 0

Attorney Review Completed
* Attorney Review Concluded | Attorney review completed date | 0
* Contingency Date Letter | Attorney review completed date | +1
* 1st Deposit Received | Attorney review completed date | +3
* 2nd Deposit Received | Attorney review completed date | +10
* Appraisal | Attorney review completed date | +14
* Home Inspection Contingency Satisfied | Attorney review completed date | +14
* Home Inspection Letter Sent Out | Attorney review completed date | +14
* Home Inspection Report Received | Attorney review completed date | +14
* Mortgage Commitment Received | Attorney review completed date | +30

Second Deposit
* Escrow Letter | Second deposit due date | 0

Closing
* Certificate of Occupancy | Closing date | -14
* Smoke Cert | Closing date | -14
* Title Binder Received | Closing date | -14
* Final Water/Sewer Read Ordered | Closing date | -10
* Order Mortgage Payoff | Closing date | -10
* Sale Documents Sent Out | Closing date | -10
* Sale Documents Approved | Closing date | -8
* Cleared to Close | Closing date | -5
* Final Water/Sewer Received | Closing date | -5
* Mortgage Payoff Received | Closing date | -5
* Realtor Commission Statement | Closing date | -5
* Sale Docs Signed | Closing date | -4
* Closing Scheduled | Closing date | -3
* Keys | Closing date | -3
* Seller ID | Closing date | -3
* Package Sent Out | Closing date | -2
* Deposit Checks Cut | Closing date | -1
* Escrow Held? | Closing date | 0

Post Closing
* File Completed | File complete date | 0

Not Proceeding
* Not Proceeding | Not proceeding date | 0`;

export const STARTERS: { name: string; outline: string }[] = [
  { name: "Real Estate Purchase", outline: REAL_ESTATE_PURCHASE },
  { name: "Real Estate Purchase Workflow [NJ]", outline: RE_PURCHASE_NJ },
  { name: "Real Estate Sale Workflow [NJ]", outline: RE_SALE_NJ },
];
