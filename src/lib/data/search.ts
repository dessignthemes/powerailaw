import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/data/org";
import { listTasks } from "@/lib/data/tasks";
import { searchTeamEvents } from "@/lib/calendar/events";

// The search box in the top bar: matters, contacts, documents, events, notes,
// tasks and communications, each result with where it opens. Tasks respect
// private tasks; internal messages show only to their sender and recipients.

export const SEARCH_TYPES = ["matters", "contacts", "documents", "events", "notes", "tasks", "communications"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
// person: a client or contact, so Search can run a conflict check on them straight away.
export type SearchHit = {
  type: SearchType;
  id: string;
  title: string;
  sub: string;
  href: string;
  external?: boolean;
  at?: string | null;
  person?: { name: string; email?: string | null; phone?: string | null; company?: string | null; clientId?: string | null };
};

const PER_TYPE = 8;
const db = () => createAdminClient();

// Safe inside PostgREST filters: no commas, brackets, wildcards or quotes.
const clean = (q: string) => q.replace(/[,()*%\\"'`:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const like = (q: string) => `*${q}*`;
const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const hasAll = (text: string, ws: string[]) => {
  const t = text.toLowerCase();
  return ws.every((w) => t.includes(w));
};
const snippet = (text: string, ws: string[], len = 110) => {
  const flat = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const i = Math.max(0, flat.toLowerCase().indexOf(ws[0] ?? ""));
  const start = Math.max(0, i - 30);
  return (start > 0 ? "…" : "") + flat.slice(start, start + len) + (flat.length > start + len ? "…" : "");
};
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export async function globalSearch(rawQ: string, types: SearchType[]): Promise<SearchHit[]> {
  const q = clean(rawQ);
  if (q.length < 2) return [];
  const ws = words(q);
  const orgId = await getCurrentOrgId();
  const me = await getSessionUser();
  const want = (t: SearchType) => types.includes(t);
  const out: SearchHit[] = [];
  const jobs: Promise<void>[] = [];

  // Matter names, for showing which matter a result belongs to.
  const { data: matterRows } = await db().from("matters").select("id, title, matter_number, status, category, description, private_notes, client_id").eq("org_id", orgId).limit(5000);
  const matters = (matterRows ?? []) as { id: string; title: string; matter_number?: string | null; status: string; category: string | null; description: string | null; private_notes: string | null; client_id: string | null }[];
  const matterLabel = (id: string | null | undefined) => {
    const m = id ? matters.find((x) => x.id === id) : null;
    return m ? m.matter_number ?? m.title : "";
  };

  if (want("matters")) {
    for (const m of matters) {
      if (out.filter((h) => h.type === "matters").length >= PER_TYPE) break;
      if (hasAll(`${m.matter_number ?? ""} ${m.title} ${m.category ?? ""} ${m.description ?? ""}`, ws))
        out.push({ type: "matters", id: m.id, title: m.matter_number ? `${m.matter_number} · ${m.title}` : m.title, sub: [m.status, m.category].filter(Boolean).join(" · "), href: `/dashboard/matters/${m.id}` });
    }
  }

  if (want("contacts"))
    jobs.push(
      (async () => {
        const [cl, co] = await Promise.all([
          db().from("clients").select("id, name, email, phone, status").eq("org_id", orgId).or(`name.ilike.${like(q)},email.ilike.${like(q)},phone.ilike.${like(q)}`).limit(PER_TYPE),
          db().from("contacts").select("id, name, company, role, email, phone").eq("org_id", orgId).or(`name.ilike.${like(q)},company.ilike.${like(q)},email.ilike.${like(q)},phone.ilike.${like(q)}`).limit(PER_TYPE),
        ]);
        for (const c of (cl.data ?? []) as { id: string; name: string; email: string | null; phone: string | null }[])
          out.push({ type: "contacts", id: c.id, title: c.name, sub: ["Client", c.email, c.phone].filter(Boolean).join(" · "), href: `/dashboard/client-intake?card=${c.id}`, person: { name: c.name, email: c.email, phone: c.phone, clientId: c.id } });
        for (const c of (co.data ?? []) as { id: string; name: string; company: string; role: string; email: string | null; phone: string | null }[])
          out.push({ type: "contacts", id: c.id, title: c.name, sub: [c.role || "Contact", c.company, c.email, c.phone].filter(Boolean).join(" · "), href: `/dashboard/records?contact=${c.id}`, person: { name: c.name, email: c.email, phone: c.phone, company: c.company } });
      })()
    );

  if (want("documents"))
    jobs.push(
      (async () => {
        const { data } = await db().from("documents").select("id, title, matter_id, updated_at").eq("org_id", orgId).ilike("title", like(q)).order("updated_at", { ascending: false }).limit(PER_TYPE);
        for (const d of (data ?? []) as { id: string; title: string; matter_id: string; updated_at: string }[])
          out.push({ type: "documents", id: d.id, title: d.title, sub: [matterLabel(d.matter_id), fmt(d.updated_at)].filter(Boolean).join(" · "), href: `/dashboard/matters/${d.matter_id}?tab=documents`, at: d.updated_at });
      })()
    );

  // Tasks and their comments (only the tasks this person may see).
  if (want("tasks") || want("notes"))
    jobs.push(
      (async () => {
        const tasks = await listTasks();
        const href = (t: { id: string; boardId?: string | null }) => `/dashboard/task-board?board=${t.boardId ?? "general"}&task=${t.id}`;
        if (want("tasks")) {
          for (const t of tasks.filter((t) => hasAll(`${t.title} ${(t.description ?? "").replace(/<[^>]+>/g, " ")}`, ws)).slice(-PER_TYPE).reverse())
            out.push({ type: "tasks", id: t.id, title: t.title, sub: [t.status === "done" ? "Done" : t.dueDate ? `Due ${fmt(t.dueDate)}` : "No due date", matterLabel(t.matterId)].filter(Boolean).join(" · "), href: href(t) });
        }
        if (want("notes")) {
          let n = 0;
          for (const t of [...tasks].reverse()) {
            const c = (t.comments ?? []).find((c) => hasAll(c.body ?? "", ws));
            if (!c) continue;
            out.push({ type: "notes", id: `c:${t.id}:${c.id}`, title: snippet(c.body, ws), sub: `Comment on task: ${t.title}`, href: href(t), at: c.createdAt });
            if (++n >= 4) break;
          }
        }
      })()
    );

  // Notes: matters' private notes, client card notes, lead notes.
  if (want("notes"))
    jobs.push(
      (async () => {
        let n = 0;
        for (const m of matters) {
          if (n >= 4) break;
          if (m.private_notes && hasAll(m.private_notes, ws)) {
            out.push({ type: "notes", id: `m:${m.id}`, title: snippet(m.private_notes, ws), sub: `Matter notes · ${m.matter_number ?? m.title}`, href: `/dashboard/matters/${m.id}` });
            n++;
          }
        }
        const [cl, ld] = await Promise.all([
          db().from("clients").select("id, name, description").eq("org_id", orgId).ilike("description", like(q)).limit(4),
          db().from("leads").select("id, first_name, last_name, company, notes").eq("org_id", orgId).ilike("notes", like(q)).limit(3),
        ]);
        for (const c of (cl.data ?? []) as { id: string; name: string; description: string }[])
          out.push({ type: "notes", id: `cl:${c.id}`, title: snippet(c.description, ws), sub: `Client notes · ${c.name}`, href: `/dashboard/client-intake?card=${c.id}` });
        for (const l of (ld.data ?? []) as { id: string; first_name: string; last_name: string; company: string; notes: string }[])
          out.push({ type: "notes", id: `ld:${l.id}`, title: snippet(l.notes, ws), sub: `Lead notes · ${[l.first_name, l.last_name].filter(Boolean).join(" ") || l.company}`, href: `/dashboard/leads?lead=${l.id}` });
      })()
    );

  // Communications: phone logs, internal messages (sender/recipients only), emails and texts filed to matters.
  if (want("communications"))
    jobs.push(
      (async () => {
        const [cm, mm] = await Promise.all([
          db()
            .from("communications")
            .select("id, kind, direction, contact_name, contact_phone, subject, body, occurred_at, matter_id, created_by, recipients")
            .eq("org_id", orgId)
            .or(`contact_name.ilike.${like(q)},contact_phone.ilike.${like(q)},subject.ilike.${like(q)},body.ilike.${like(q)}`)
            .order("occurred_at", { ascending: false })
            .limit(20),
          db()
            .from("matter_messages")
            .select("id, matter_id, channel, direction, subject, from_name, from_email, snippet, sent_at")
            .eq("org_id", orgId)
            .or(`subject.ilike.${like(q)},from_name.ilike.${like(q)},from_email.ilike.${like(q)},snippet.ilike.${like(q)}`)
            .order("sent_at", { ascending: false })
            .limit(PER_TYPE),
        ]);
        let n = 0;
        for (const c of (cm.data ?? []) as { id: string; kind: string; direction: string; contact_name: string; contact_phone: string; subject: string; body: string; occurred_at: string; matter_id: string | null; created_by: string | null; recipients: string[] }[]) {
          if (c.kind === "internal" && me && c.created_by !== me.id && !(c.recipients ?? []).includes(me.id)) continue;
          out.push({
            type: "communications",
            id: `cm:${c.id}`,
            title: c.kind === "call" ? `${c.direction === "out" ? "Call to" : "Call from"} ${c.contact_name || c.contact_phone}${c.subject ? `: ${c.subject}` : ""}` : snippet(c.body, ws, 90),
            sub: [c.kind === "call" ? "Phone log" : "Internal message", matterLabel(c.matter_id), fmt(c.occurred_at)].filter(Boolean).join(" · "),
            href: `/dashboard/communications?view=${c.kind === "call" ? "calls" : "internal"}`,
            at: c.occurred_at,
          });
          if (++n >= PER_TYPE) break;
        }
        if (!mm.error)
          for (const m of (mm.data ?? []) as { id: string; matter_id: string; channel: string; direction: string; subject: string; from_name: string; from_email: string; snippet?: string; sent_at?: string }[])
            out.push({
              type: "communications",
              id: `mm:${m.id}`,
              title: m.subject || snippet(m.snippet ?? "", ws, 90) || "(no subject)",
              sub: [m.channel === "sms" ? "Text" : "Email", m.from_name || m.from_email, matterLabel(m.matter_id), fmt(m.sent_at)].filter(Boolean).join(" · "),
              href: `/dashboard/matters/${m.matter_id}?tab=emails`,
              at: m.sent_at ?? null,
            });
      })()
    );

  await Promise.all(jobs.map((j) => j.catch((e) => console.error("Search part failed:", e))));
  return out;
}

// Events come from the person's own calendar (slower, so they're asked for separately).
export async function searchMyEvents(rawQ: string): Promise<SearchHit[]> {
  const q = clean(rawQ);
  if (q.length < 2) return [];
  const me = await getSessionUser();
  if (!me) return [];
  const orgId = await getCurrentOrgId();
  const { events } = await searchTeamEvents(orgId, me.id, q, me.id);
  return events
    .sort((a, b) => Math.abs(Date.parse(a.start) - Date.now()) - Math.abs(Date.parse(b.start) - Date.now()))
    .slice(0, PER_TYPE)
    .map((e) => ({
      type: "events" as const,
      id: e.id,
      title: e.title,
      sub: [e.allDay ? fmt(`${e.start}T12:00:00`) : new Date(e.start).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }), e.location].filter(Boolean).join(" · "),
      href: e.link ?? "/dashboard/calendar",
      external: !!e.link,
      at: e.start,
    }));
}
