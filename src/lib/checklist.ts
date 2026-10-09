// Checklist templates and task checklists (shared by browser and server).

export type TemplateItem = { id: string; text: string };
export type TemplateSection = { id: string; title: string; items: TemplateItem[] };
export type TaskTemplate = { id: string; name: string; sections: TemplateSection[]; updatedAt?: string };

export type ChecklistItem = { id: string; text: string; done: boolean; doneAt?: string | null };
export type ChecklistSection = { id: string; title: string; items: ChecklistItem[] };
export type TaskChecklist = { templates: string[]; sections: ChecklistSection[] };

export const MAX_SECTIONS = 30;
export const MAX_ITEMS = 60; // per section
const MAX_TEXT = 200;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

const clean = (v: unknown, max = MAX_TEXT) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

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
          const it = (i ?? {}) as { id?: unknown; text?: unknown };
          return { id: clean(it.id, 64) || newId(), text: clean(it.text) };
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
        const it = (i ?? {}) as { id?: unknown; text?: unknown; done?: unknown; doneAt?: unknown };
        const done = it.done === true;
        return { id: clean(it.id, 64) || newId(), text: clean(it.text), done, doneAt: done ? clean(it.doneAt, 40) || null : null };
      }).filter((i) => i.text),
    };
  });
  const templates = Array.isArray(c.templates) ? c.templates.slice(0, 20).map((t) => clean(t, 80)).filter(Boolean) : [];
  if (!sections.length) return null;
  return { templates, sections };
}

// Adds a template's sections to a task's checklist (fresh, unticked items).
export function applyTemplate(current: TaskChecklist | null | undefined, t: TaskTemplate): TaskChecklist {
  const added: ChecklistSection[] = t.sections.map((s) => ({
    id: newId(),
    title: s.title,
    items: s.items.map((i) => ({ id: newId(), text: i.text, done: false, doneAt: null })),
  }));
  return {
    templates: [...(current?.templates ?? []), t.name],
    sections: [...(current?.sections ?? []), ...added],
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
      const t = clean(item[2]);
      if (t) sections[sections.length - 1].items.push({ id: newId(), text: t });
    } else if (!/^checklist$/i.test(line)) {
      sections.push({ id: newId(), title: clean(line, 120), items: [] });
    }
  }
  return sections.filter((s) => s.items.length || s.title).slice(0, MAX_SECTIONS);
}

export function toOutline(sections: TemplateSection[]): string {
  return sections.map((s) => [s.title, ...s.items.map((i) => `* ${i.text}`)].join("\n")).join("\n\n");
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
