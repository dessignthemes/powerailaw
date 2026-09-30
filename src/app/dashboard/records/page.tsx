"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ChevronDown, ChevronRight, CircleUser, Briefcase, User, Building2, Bookmark } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import NewClientModal, { getInitials, getAvatarColor, formatUpdatedAt, type Client } from "@/components/NewClientModal";
import NewMatterModal from "@/components/NewMatterModal";
import ContactModal from "@/components/records/ContactModal";
import type { Contact, ContactInput, ContactKind } from "@/lib/records/contactTypes";

type Kind = "client" | "matter" | "person" | "company";
type Tab = "all" | Kind;

type Row = {
  key: string;
  kind: Kind;
  id: string;
  name: string;
  detail: string[];
  search: string;
  updatedAt: string;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "client", label: "Clients" },
  { key: "matter", label: "Matters" },
  { key: "person", label: "People" },
  { key: "company", label: "Companies" },
];

const KIND_LABEL: Record<Kind, string> = { client: "Client", matter: "Matter", person: "Person", company: "Company" };
const EMPTY_LABEL: Record<Kind, string> = { client: "clients", matter: "matters", person: "people", company: "companies" };
const EMPTY_HINT: Record<Tab, string> = {
  all: "Add clients, matters, and the people and companies involved in your cases.",
  client: "Add the people and businesses you represent.",
  matter: "Add a case or piece of work for a client.",
  person: "Add opposing counsel, witnesses, experts and anyone else involved in a matter.",
  company: "Add courts, opposing parties, vendors and other organizations.",
};

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const blackBtn = "bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors";

export default function RecordsPage() {
  const router = useRouter();
  const { clients, clientsLoaded, matters, mattersLoaded, addClient, updateClient, addMatter } = useWorkspaceData();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const [adding, setAdding] = useState<Kind | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contacts")
      .then(readJson)
      .then((d) => {
        if (cancelled) return;
        setContacts(d.contacts ?? []);
        setSetupRequired(!!d.setupRequired);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setContactsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const loaded = clientsLoaded && mattersLoaded && contactsLoaded;
  const clientName = useCallback((id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? null : null), [clients]);
  const matterTitle = useCallback((id: string | null) => (id ? matters.find((m) => m.id === id)?.title ?? null : null), [matters]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of clients) {
      const n = matters.filter((m) => m.clientId === c.id).length;
      const detail = [c.type, c.status === "Archived" ? "Archived" : "", c.email ?? "", c.phone ?? "", plural(n, "matter", "matters")].filter(Boolean);
      out.push({
        key: `client:${c.id}`,
        kind: "client",
        id: c.id,
        name: c.name,
        detail,
        search: [c.name, c.description, c.address ?? "", ...detail].join(" "),
        updatedAt: c.updatedAt,
      });
    }
    for (const m of matters) {
      const detail = [
        clientName(m.clientId) ?? "No client",
        m.status,
        m.category && m.category !== "None" ? m.category : "",
        m.counterparty ? `vs. ${m.counterparty}` : "",
      ].filter(Boolean);
      out.push({
        key: `matter:${m.id}`,
        kind: "matter",
        id: m.id,
        name: m.title,
        detail,
        search: [m.title, m.description, ...detail].join(" "),
        updatedAt: m.updatedAt,
      });
    }
    for (const p of contacts) {
      const matter = matterTitle(p.matterId);
      const client = clientName(p.clientId);
      const detail = [
        p.role,
        p.kind === "person" ? p.company : "",
        p.email ?? "",
        p.phone ?? "",
        matter ? `Matter: ${matter}` : "",
        client ? `Client: ${client}` : "",
      ].filter(Boolean);
      out.push({
        key: `${p.kind}:${p.id}`,
        kind: p.kind,
        id: p.id,
        name: p.name,
        detail,
        search: [p.name, p.notes, p.address ?? "", ...detail].join(" "),
        updatedAt: p.updatedAt,
      });
    }
    return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [clients, matters, contacts, clientName, matterTitle]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, client: 0, matter: 0, person: 0, company: 0 };
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const words = q.split(/\s+/).filter(Boolean);
    return rows.filter((r) => (tab === "all" || r.kind === tab) && words.every((w) => r.search.toLowerCase().includes(w)));
  }, [rows, tab, q]);

  function open(r: Row) {
    if (r.kind === "matter") router.push(`/dashboard/matters/${r.id}`);
    else if (r.kind === "client") setEditingClient(clients.find((c) => c.id === r.id) ?? null);
    else setEditingContact(contacts.find((c) => c.id === r.id) ?? null);
  }

  function startAdd(kind: Kind) {
    setMenuOpen(false);
    setAdding(kind);
  }

  async function saveContact(input: ContactInput, id?: string) {
    const d = await fetch(id ? `/api/contacts/${id}` : "/api/contacts", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(readJson);
    const saved: Contact = d.contact;
    setContacts((list) => (id ? list.map((c) => (c.id === id ? saved : c)) : [saved, ...list]));
    setAdding(null);
    setEditingContact(null);
  }

  async function deleteContact(id: string) {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" }).then(readJson);
    setContacts((list) => list.filter((c) => c.id !== id));
    setEditingContact(null);
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[28px] font-semibold">
          Records <span className="text-muted font-normal text-[18px]">/ {loaded ? counts.all : "–"}</span>
        </h1>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="bg-btn text-ink pl-4 pr-3 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors flex items-center gap-1.5"
          >
            + Add record
            <ChevronDown size={14} strokeWidth={2} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+6px)] z-50 w-[220px] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5"
              >
                {(["client", "matter", "person", "company"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    role="menuitem"
                    onClick={() => startAdd(k)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left hover:bg-card-alt transition-colors"
                  >
                    <KindIcon kind={k} />
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="text-[14.5px] text-muted mb-6">
        {loaded
          ? `${plural(counts.all, "record", "records")} — ${plural(counts.client, "client", "clients")}, ${plural(counts.matter, "matter", "matters")}, ${plural(
              counts.person,
              "person",
              "people"
            )}, ${plural(counts.company, "company", "companies")}`
          : "Loading records…"}
      </p>

      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
                tab === t.key ? "bg-btn text-ink ring-1 ring-inset ring-btn-ring" : "bg-card-alt text-ink hover:bg-line/70"
              }`}
            >
              {t.label} <span className={tab === t.key ? "text-ink/60" : "text-muted"}>{loaded ? counts[t.key] : ""}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Find a record..."
            aria-label="Find a record"
            className="w-full border border-line bg-white rounded-full pl-10 pr-9 py-2 text-[13.5px] outline-none focus:border-ink placeholder:text-muted"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 flex-shrink-0" aria-label="Dismiss">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}
      {setupRequired && (tab === "person" || tab === "company") && (
        <div className="mb-5 rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">
          People and companies need a database update. Run <span className="font-medium">supabase/migrations/0014_contacts.sql</span> in the
          Supabase SQL editor, then refresh.
        </div>
      )}

      <div className="bg-card-alt rounded-2xl p-2">
        {!loaded ? (
          <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">Loading records…</div>
        ) : shown.length === 0 ? (
          <div className="bg-cream rounded-xl py-14 text-center px-6">
            <Bookmark size={22} strokeWidth={1.5} className="text-muted mx-auto mb-3" />
            {q ? (
              <>
                <div className="text-[14.5px] font-medium">No records match “{query.trim()}”</div>
                <button onClick={() => setQuery("")} className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium mt-4 transition-colors">
                  Clear search
                </button>
              </>
            ) : (
              <>
                <div className="text-[14.5px] font-medium">{tab === "all" ? "No records yet" : `No ${EMPTY_LABEL[tab]} yet`}</div>
                <div className="text-[13px] text-muted mt-1 mb-5">{EMPTY_HINT[tab]}</div>
                {tab === "all" ? (
                  <button onClick={() => setMenuOpen(true)} className={blackBtn}>
                    + Add record
                  </button>
                ) : (
                  <button onClick={() => startAdd(tab)} className={blackBtn}>
                    + Add {KIND_LABEL[tab].toLowerCase()}
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="bg-cream rounded-xl divide-y divide-line">
            {shown.map((r) => (
              <button
                key={r.key}
                onClick={() => open(r)}
                className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left hover:bg-card-alt/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <Avatar kind={r.kind} name={r.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14.5px] font-medium truncate">{r.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-line/60 text-[11.5px] font-medium text-ink flex-shrink-0">
                      {KIND_LABEL[r.kind]}
                    </span>
                  </div>
                  {r.detail.length > 0 && <div className="text-[12.5px] text-muted truncate">{r.detail.join(" · ")}</div>}
                </div>
                <span className="text-[12.5px] text-muted flex-shrink-0 hidden sm:block">{r.updatedAt ? formatUpdatedAt(r.updatedAt) : ""}</span>
                <ChevronRight size={16} strokeWidth={1.75} className="text-muted flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {adding === "client" && (
        <NewClientModal
          onClose={() => setAdding(null)}
          onSubmit={(c) => {
            addClient(c);
            setAdding(null);
          }}
        />
      )}
      {adding === "matter" && (
        <NewMatterModal
          clients={clients}
          onClose={() => setAdding(null)}
          onSubmit={(m) => {
            addMatter(m);
            setAdding(null);
          }}
        />
      )}
      {(adding === "person" || adding === "company") &&
        (setupRequired ? (
          <SetupModal onClose={() => setAdding(null)} />
        ) : (
          <ContactModal
            initialKind={adding as ContactKind}
            clients={clients}
            matters={matters}
            onClose={() => setAdding(null)}
            onSave={(input) => saveContact(input)}
          />
        ))}
      {editingClient && (
        <NewClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSubmit={(c) => {
            updateClient(c);
            setEditingClient(null);
          }}
        />
      )}
      {editingContact && (
        <ContactModal
          contact={editingContact}
          initialKind={editingContact.kind}
          clients={clients}
          matters={matters}
          onClose={() => setEditingContact(null)}
          onSave={(input) => saveContact(input, editingContact.id)}
          onDelete={() => deleteContact(editingContact.id)}
        />
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: Kind }) {
  const p = { size: 15, strokeWidth: 1.75, className: "text-muted" };
  if (kind === "client") return <CircleUser {...p} />;
  if (kind === "matter") return <Briefcase {...p} />;
  if (kind === "person") return <User {...p} />;
  return <Building2 {...p} />;
}

function Avatar({ kind, name }: { kind: Kind; name: string }) {
  if (kind === "client" || kind === "person") {
    return (
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center text-[11.5px] font-semibold text-white flex-shrink-0"
        style={{ background: getAvatarColor(name) }}
      >
        {getInitials(name)}
      </span>
    );
  }
  return (
    <span className="w-8 h-8 rounded-full bg-card-alt flex items-center justify-center flex-shrink-0">
      {kind === "matter" ? <Briefcase size={15} strokeWidth={1.75} className="text-muted" /> : <Building2 size={15} strokeWidth={1.75} className="text-muted" />}
    </span>
  );
}

function SetupModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-[460px] p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[20px] font-semibold mb-2">One setup step first</h2>
        <p className="text-[14px] text-muted mb-5">
          People and companies need a database update. Run <span className="text-ink font-medium">supabase/migrations/0014_contacts.sql</span> in
          the Supabase SQL editor, then refresh this page.
        </p>
        <div className="flex justify-end">
          <button onClick={onClose} className={blackBtn}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
