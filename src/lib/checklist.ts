// Checklist templates and task checklists (shared by browser and server).

// anchor = the critical date the step hangs off (e.g. "Closing date"); days = +/- days from it.
// moveTo = when this step is ticked, the task moves to that column (e.g. "Review Letter Sent Out" → Waiting).
export type MoveTo = "inprogress" | "waiting" | "done";
export const MOVE_LABEL: Record<MoveTo, string> = { inprogress: "In progress", waiting: "Waiting", done: "Done" };
export type TemplateItem = { id: string; text: string; anchor?: string; days?: number; moveTo?: MoveTo };
export type TemplateSection = { id: string; title: string; items: TemplateItem[] };
// example = built-in template every firm gets (read-only; saving makes the firm its own copy).
// matterCodes = the matters it's for (e.g. ["REP"]); the matter's Tasks tab suggests it there.
export type TaskTemplate = { id: string; name: string; sections: TemplateSection[]; matterCodes?: string[]; updatedAt?: string; example?: boolean };

// na = not applicable to this deal (e.g. mortgage steps on a cash purchase): not counted, no due date.
export type ChecklistItem = { id: string; text: string; done: boolean; doneAt?: string | null; anchor?: string; days?: number; na?: boolean; moveTo?: MoveTo };
export type ChecklistSection = { id: string; title: string; items: ChecklistItem[] };
// dates = the task's critical dates ("Closing date" -> "2026-11-20"), used to work out each step's due date.
// auto = false turns automatic moving off for this task (on by default).
export type TaskChecklist = { templates: string[]; sections: ChecklistSection[]; dates?: Record<string, string>; auto?: boolean };

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
const MOVES: MoveTo[] = ["inprogress", "waiting", "done"];
const moveOf = (v: unknown) => (MOVES.includes(v as MoveTo) ? { moveTo: v as MoveTo } : {});
const moveFromText = (v: string | undefined): MoveTo | undefined => {
  const t = (v ?? "").toLowerCase().replace(/^move\s*:?\s*(to\s*)?/, "").replace(/[^a-z]/g, "");
  return t === "inprogress" ? "inprogress" : t === "waiting" ? "waiting" : t === "done" ? "done" : undefined;
};
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
          const it = (i ?? {}) as { id?: unknown; text?: unknown; anchor?: unknown; days?: unknown; moveTo?: unknown };
          return { id: clean(it.id, 64) || newId(), text: clean(it.text), ...timing(it), ...moveOf(it.moveTo) };
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
        const it = (i ?? {}) as { id?: unknown; text?: unknown; done?: unknown; doneAt?: unknown; anchor?: unknown; days?: unknown; na?: unknown; moveTo?: unknown };
        const done = it.done === true;
        return {
          id: clean(it.id, 64) || newId(),
          text: clean(it.text),
          done,
          doneAt: done ? clean(it.doneAt, 40) || null : null,
          ...timing(it),
          ...(it.na === true ? { na: true } : {}),
          ...moveOf(it.moveTo),
        };
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
  const auto = (c as { auto?: unknown }).auto === false ? { auto: false } : {};
  return { templates, sections, ...(Object.keys(dates).length ? { dates } : {}), ...auto };
}

// Adds a template's sections to a task's checklist (fresh, unticked items).
export function applyTemplate(current: TaskChecklist | null | undefined, t: TaskTemplate): TaskChecklist {
  const added: ChecklistSection[] = t.sections.map((s) => ({
    id: newId(),
    title: s.title,
    items: s.items.map((i) => ({
      id: newId(),
      text: i.text,
      done: false,
      doneAt: null,
      ...(i.anchor ? { anchor: i.anchor, days: i.days ?? 0 } : {}),
      ...(i.moveTo ? { moveTo: i.moveTo } : {}),
    })),
  }));
  return {
    templates: [...(current?.templates ?? []), t.name],
    sections: [...(current?.sections ?? []), ...added],
    ...(current?.dates ? { dates: current.dates } : {}),
    ...(current?.auto === false ? { auto: false } : {}),
  };
}

export function progress(c: TaskChecklist | null | undefined) {
  let total = 0;
  let done = 0;
  for (const s of c?.sections ?? []) for (const i of s.items) {
    if (i.na) continue;
    total++;
    if (i.done) done++;
  }
  return { total, done };
}

// Turns pasted text into sections: a plain line starts a section, "* item" / "- item" / "• item" lines are its items.
// A step line starts with a bullet or checkbox as people paste them from Word,
// Outlook or a website (* - + • ◦ ▪ ● ○ ■ □ ☐ ☑ ☒ ✓ ✔ – — ➢ ➤ ►, [ ] / [x] / - [ ]),
// or with a number / letter ("1." "1)" "a)").
const SYMBOL_STEP = /^(?:[*\-+•◦▪▫●○■□☐☑☒✓✔–—➢➤►‣⁃]\s*(?:\[[ xX✓]?\]\s*)?|\[[ xX✓]?\])\s*(.+)$/;
const NUMBERED = /^(?:\d{1,3}[.)]|[a-zA-Z][.)](?=\s))\s*(.+)$/;
const FILL_IN = /_{4,}/; // "Notes / follow-up: ________" — a blank to write on, not a step

export function parseOutline(text: string): TemplateSection[] {
  const sections: TemplateSection[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter((l) => l && !(FILL_IN.test(l) && !SYMBOL_STEP.test(l)));
  // When steps use bullets / checkboxes, numbered and lettered lines are headings
  // ("1. INITIAL INTAKE", "A. Probate Matter"). Otherwise numbered lines are steps.
  const symbolSteps = lines.some((l) => SYMBOL_STEP.test(l));
  const anyNumbered = lines.some((l) => NUMBERED.test(l));
  // A plain list (no bullets, numbers or blank-line sections): every line is a step.
  const plainList = !symbolSteps && !anyNumbered && !/\n\s*\n/.test(text.trim()) && lines.length > 1;
  for (const line of lines) {
    const sym = SYMBOL_STEP.exec(line);
    const num = !symbolSteps ? NUMBERED.exec(line) : null;
    const stepText = sym ? sym[1] : num ? num[1] : plainList ? line : null;
    if (stepText !== null) {
      if (!sections.length) sections.push({ id: newId(), title: "Steps", items: [] }); // steps before any heading
      const parts = stepText.split("|").map((x) => x.trim());
      const moveIdx = parts.findIndex((x, i) => i > 0 && /^move\b/i.test(x));
      const moveTo = moveIdx > 0 ? moveFromText(parts.splice(moveIdx, 1)[0]) : undefined;
      const [t0, anchor, days] = parts;
      const t = clean(t0.replace(FILL_IN, "").trim());
      if (t)
        sections[sections.length - 1].items.push({
          id: newId(),
          text: t,
          ...timing({ anchor, days: days?.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[^\d-]/g, "") }),
          ...(moveTo ? { moveTo } : {}),
        });
    } else if (!/^checklist$/i.test(line)) {
      const title = clean(line.replace(/[:：]\s*$/, ""), 120);
      const last = sections[sections.length - 1];
      // A sub-heading right under a heading joins it ("2. OPEN THE ESTATE — A. Probate Matter").
      if (last && !last.items.length && last.title && last.title !== "Steps") last.title = clean(`${last.title} — ${title}`, 120);
      else sections.push({ id: newId(), title, items: [] });
    }
  }
  return sections.filter((s) => s.items.length || s.title).slice(0, MAX_SECTIONS);
}

// The first heading without its numbering ("1. INITIAL INTAKE" → "INITIAL INTAKE"), for a template name.
export function outlineName(sections: TemplateSection[]): string {
  const t = sections.find((s) => s.title && s.title !== "Steps")?.title ?? "";
  return t.replace(/^(?:\d{1,3}|[a-zA-Z])[.)]\s*/, "").split(" — ")[0].trim().slice(0, 120);
}

export function toOutline(sections: TemplateSection[]): string {
  return sections
    .map((s) =>
      [
        s.title,
        ...s.items.map(
          (i) => (i.anchor ? `* ${i.text} | ${i.anchor} | ${fmtDays(i.days ?? 0)}` : `* ${i.text}`) + (i.moveTo ? ` | move: ${MOVE_LABEL[i.moveTo]}` : "")
        ),
      ].join("\n")
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Due dates: each timed step is due <days> after (or before) one of the task's critical dates.
// ---------------------------------------------------------------------------
export const fmtDays = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `\u2212${Math.abs(d)}` : "0");

export const COMMON_ANCHORS = [
  "Engagement date",
  "Contract signed date",
  "Attorney review completed date",
  "Initial deposit due date",
  "Second deposit due date",
  "Home inspection contingency date",
  "Appraisal contingency date",
  "Mortgage contingency date",
  "Closing Disclosure issue date",
  "Closing date",
  "File complete date",
  "Not proceeding date",
];

// Critical dates used by a checklist, in the order they first appear.
export function anchorsOf(c: TaskChecklist | null | undefined): string[] {
  const seen: string[] = [];
  for (const s of c?.sections ?? []) for (const i of s.items) if (i.anchor && !i.na && !seen.includes(i.anchor)) seen.push(i.anchor);
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
  if (!item.anchor || item.na) return { state: "none", due: null };
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
* File Completed | File complete date | 0 | move: Done

Not Proceeding
* Not Proceeding | Not proceeding date | 0 | move: Done`;

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
* File Completed | File complete date | 0 | move: Done

Not Proceeding
* Not Proceeding | Not proceeding date | 0 | move: Done`;

// Built-in examples every firm sees (a firm's own template with the same name takes its place).
export const EXAMPLE_TEMPLATES: TaskTemplate[] = [
  { id: "example-re-purchase", name: "Real Estate Purchase Workflow", sections: parseOutline(RE_PURCHASE_NJ), matterCodes: ["REP"], example: true },
  { id: "example-re-sale", name: "Real Estate Sale Workflow", sections: parseOutline(RE_SALE_NJ), matterCodes: ["RES"], example: true },
];

export function withExamples(own: TaskTemplate[]): TaskTemplate[] {
  const names = new Set(own.map((t) => t.name.trim().toLowerCase()));
  return [...own, ...EXAMPLE_TEMPLATES.filter((e) => !names.has(e.name.toLowerCase()))].sort((a, b) => a.name.localeCompare(b.name));
}

// The next open step that has a due date (earliest first), for task cards.
export function nextStep(c: TaskChecklist | null | undefined): { text: string; due: string; state: DueState } | null {
  let best: { text: string; due: string; state: DueState } | null = null;
  for (const s of c?.sections ?? []) for (const i of s.items) {
    if (i.done) continue;
    const { state, due } = dueState(i, c?.dates);
    if (due && (!best || due < best.due)) best = { text: i.text, due, state };
  }
  return best;
}

// ── Mortgage steps on a cash deal ───────────────────────────────────────────
const MORTGAGE = /mortgage/i;
const isMortgageItem = (sectionTitle: string, i: { text: string; anchor?: string }) =>
  MORTGAGE.test(sectionTitle) || MORTGAGE.test(i.text) || MORTGAGE.test(i.anchor ?? "");

// Whether a template or checklist has mortgage steps (so "cash deal" is offered).
export function hasMortgageSteps(c: { sections: { title: string; items: { text: string; anchor?: string }[] }[] } | null | undefined) {
  return !!c?.sections.some((s) => s.items.some((i) => isMortgageItem(s.title, i)));
}

// Marks every mortgage step not applicable (cash deal), or applicable again.
export function setMortgageNa(c: TaskChecklist, na: boolean): TaskChecklist {
  return {
    ...c,
    sections: c.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => {
        if (!isMortgageItem(s.title, i)) return i;
        if (na) return { ...i, na: true };
        const { na: _drop, ...rest } = i;
        void _drop;
        return rest;
      }),
    })),
  };
}

export const mortgageNa = (c: TaskChecklist | null | undefined) =>
  !!c?.sections.some((s) => s.items.some((i) => isMortgageItem(s.title, i) && i.na));

// ── Moving tasks automatically ──────────────────────────────────────────────
// After steps are ticked or unticked, the column the task should be in:
//  • a ticked step with "move to" moves it there (the most recently ticked one wins);
//  • every step done → Done;
//  • first step ticked on a To do task → In progress;
//  • a step unticked on a Done task → In progress.
// Returns null when the task stays where it is (moving by hand is always allowed).
export function autoStatus(
  current: "todo" | "inprogress" | "waiting" | "done",
  before: TaskChecklist | null | undefined,
  after: TaskChecklist | null | undefined
): "todo" | "inprogress" | "waiting" | "done" | null {
  if (!after || after.auto === false) return null;
  const was = new Map<string, boolean>();
  for (const s of before?.sections ?? []) for (const i of s.items) was.set(i.id, i.done);
  const ticked: ChecklistItem[] = [];
  let unticked = false;
  for (const s of after.sections) for (const i of s.items) {
    const prev = was.get(i.id) ?? false;
    if (i.done && !prev) ticked.push(i);
    if (!i.done && prev) unticked = true;
  }
  const p = progress(after);
  const pb = progress(before);
  const nowComplete = p.total > 0 && p.done === p.total;
  const wasComplete = pb.total > 0 && pb.done === pb.total;
  // Marking the last open steps N/A completes the checklist too.
  if (!ticked.length && !unticked) return nowComplete && !wasComplete && current !== "done" ? "done" : null;
  let target: "todo" | "inprogress" | "waiting" | "done" | null = null;
  if (nowComplete) target = "done";
  else {
    const rule = [...ticked].reverse().find((i) => i.moveTo)?.moveTo;
    if (rule) target = rule;
    else if (ticked.length && current === "todo") target = "inprogress";
    else if (unticked && current === "done") target = "inprogress";
  }
  return target && target !== current ? target : null;
}
