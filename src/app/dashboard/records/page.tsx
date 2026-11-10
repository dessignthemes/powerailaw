"use client";

import ClickAway from "@/components/ClickAway";
import { menuPanel, frameOuter, frameInner, frameTitle, pageBtnB, pageBtnOpenB } from "@/lib/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ChevronDown, ChevronRight, CircleUser, Briefcase, User, Building2, Bookmark, Download, Plus, ShieldCheck, Landmark, ScrollText, Filter, Check } from "lucide-react";
import { GenericDropdown } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { getInitials, getAvatarColor, formatUpdatedAt } from "@/components/NewClientModal";
import NewMatterModal from "@/components/NewMatterModal";
import ContactModal from "@/components/records/ContactModal";
import ImportContactsModal, { type ImportSource } from "@/components/records/ImportContactsModal";
import CardsImportModal from "@/components/records/CardsImportModal";
import RunConflictModal from "@/components/conflicts/RunConflictModal";
import type { Contact, ContactInput, ContactKind } from "@/lib/records/contactTypes";

type Kind = "client" | "matter" | "person" | "company" | "trust" | "estate";
type Tab = "all" | "client" | "vendor" | "government" | "matter" | "person" | "company" | "trustEstate";

type Row = {
  key: string;
  kind: Kind;
  id: string;
  name: string;
  detail: string[];
  cat: string; // "client" | "vendor" | "other" | "" (contacts) — client cards count as clients
  tag: string; // e.g. "Vendor · Title company"
  type: string; // vendor or government office type ("" = none)
  search: string;
  updatedAt: string;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "client", label: "Clients" },
  { key: "vendor", label: "Vendors" },
  { key: "government", label: "Government" },
  { key: "matter", label: "Matters" },
  { key: "person", label: "People" },
  { key: "company", label: "Companies" },
  { key: "trustEstate", label: "Trusts & estates" },
];

const KIND_LABEL: Record<Kind, string> = { client: "Client", matter: "Matter", person: "Person", company: "Company", trust: "Trust", estate: "Estate" };
const EMPTY_LABEL: Record<Tab, string> = { all: "contacts", client: "clients", vendor: "vendors", government: "government offices", matter: "matters", person: "people", company: "companies", trustEstate: "trusts or estates" };
const EMPTY_HINT: Record<Tab, string> = {
  all: "Add clients, matters, and the people and companies involved in your cases.",
  client: "Add the people and businesses you represent. Clients are included in conflict checks.",
  vendor: "Title companies, law firms, lenders and other companies the firm works with (and their people).",
  government: "County clerks, superior and surrogate's courts, townships, tax offices and state or federal agencies.",
  matter: "Add a case or piece of work for a client.",
  person: "Add opposing counsel, witnesses, experts and anyone else involved in a matter.",
  company: "Add courts, opposing parties, vendors and other organizations.",
  trustEstate: "Trusts and estates the firm works for or with.",
};
// Which tab a row belongs to (a row can be in several: a vendor company is in Vendors and Companies).
const inTab = (r: { kind: Kind; cat: string }, t: Tab) =>
  t === "all" ||
  (t === "client" && (r.kind === "client" || r.cat === "client")) ||
  (t === "vendor" && r.cat === "vendor") ||
  (t === "government" && r.cat === "government") ||
  (t === "trustEstate" && (r.kind === "trust" || r.kind === "estate")) ||
  r.kind === t;
const PAGE = 200;

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const blackBtn = "bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover transition-colors";

export default function RecordsPage() {
  const router = useRouter();
  const { clients, clientsLoaded, matters, mattersLoaded, addMatter } = useWorkspaceData();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);

  const [adding, setAdding] = useState<Kind | null>(null);
  const [importing, setImporting] = useState<ImportSource | null>(null);
  const [cardsImport, setCardsImport] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contacts")
      .then(readJson)
      .then((d) => {
        if (cancelled) return;
        setContacts(d.contacts ?? []);
        setSetupRequired(!!d.setupRequired);
        // ?contact=<id> (e.g. a name clicked on a matter's Contacts card) opens that contact, once.
        const id = new URLSearchParams(window.location.search).get("contact");
        const c = id ? ((d.contacts ?? []) as Contact[]).find((x) => x.id === id) : null;
        if (c) {
          setEditingContact(c);
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setContactsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Kept in step with Outlook: pick up contacts added there since the last check.
  useEffect(() => {
    fetch("/api/contacts/outlook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto: true }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && (d.added > 0 || d.updated > 0) && setReloadKey((k) => k + 1))
      .catch(() => {});
  }, []);

  const loaded = clientsLoaded && mattersLoaded && contactsLoaded;
  const companyList = useMemo(
    () => contacts.filter((c) => c.kind === "company").map((c) => ({ id: c.id, name: c.name, category: c.category })).sort((a, b) => a.name.localeCompare(b.name)),
    [contacts],
  );
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
        cat: "client",
        tag: "",
        type: "",
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
        cat: "",
        tag: "",
        type: "",
        id: m.id,
        name: m.title,
        detail,
        search: [m.title, m.description, ...detail].join(" "),
        updatedAt: m.updatedAt,
      });
    }
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const staff = new Map<string, number>();
    for (const c of contacts) if (c.employerId) staff.set(c.employerId, (staff.get(c.employerId) ?? 0) + 1);
    for (const p of contacts) {
      const matter = matterTitle(p.matterId);
      const client = clientName(p.clientId);
      const employer = p.employerId ? byId.get(p.employerId)?.name ?? p.company : p.company;
      const n = staff.get(p.id) ?? 0;
      const detail = [
        p.role,
        p.kind === "person" && employer ? `at ${employer}` : "",
        p.kind !== "person" && n ? plural(n, "person", "people") : "",
        [p.city, p.state].filter(Boolean).join(", "),
        p.email ?? "",
        p.phone ?? "",
        matter ? `Matter: ${matter}` : "",
        client ? `Client: ${client}` : "",
      ].filter(Boolean);
      out.push({
        key: `${p.kind}:${p.id}`,
        kind: p.kind,
        cat: p.category,
        tag:
          p.category === "vendor"
            ? ["Vendor", p.vendorType].filter(Boolean).join(" · ")
            : p.category === "government"
              ? ["Government", p.vendorType].filter(Boolean).join(" · ")
              : p.category === "client"
                ? "Client"
                : "",
        type: p.category === "vendor" || p.category === "government" ? p.vendorType : "",
        id: p.id,
        name: p.name,
        detail,
        search: [p.name, p.shortName, p.notes, p.address ?? "", p.mobile ?? "", p.vendorType, ...detail].join(" "),
        updatedAt: p.updatedAt,
      });
    }
    return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [clients, matters, contacts, clientName, matterTitle]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, client: 0, vendor: 0, government: 0, matter: 0, person: 0, company: 0, trustEstate: 0 };
    for (const r of rows) for (const t of TABS) if (t.key !== "all" && inTab(r, t.key)) c[t.key]++;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const words = q.split(/\s+/).filter(Boolean);
    return rows.filter((r) => inTab(r, tab) && (!typeFilter || r.type === typeFilter) && words.every((w) => r.search.toLowerCase().includes(w)));
  }, [rows, tab, q, typeFilter]);

  // Types of company in this tab (Title company, Law firm, County clerk…), most common first.
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.type && inTab(r, tab)) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows, tab]);

  function open(r: Row) {
    if (r.kind === "matter") router.push(`/dashboard/matters/${r.id}`);
    else if (r.kind === "client") router.push(`/dashboard/client-intake?card=${r.id}`); // the full client card
    else setEditingContact(contacts.find((c) => c.id === r.id) ?? null);
  }

  function startAdd(kind: Kind) {
    setMenuOpen(false);
    if (kind === "client") return router.push("/dashboard/client-intake"); // the new client form
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
          Contacts <span className="text-muted font-normal text-[18px]">/ {loaded ? counts.all : "–"}</span>
        </h1>
        <div className="relative flex items-center gap-2">
          {/* Conflict check for a prospect (the results are on the Conflict Checks page). */}
          <button onClick={() => setConflictOpen(true)} className={pageBtnB}>
            <ShieldCheck size={14} /> Run conflict check
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={menuOpen ? pageBtnOpenB : pageBtnB}
          >
            <Plus size={14} /> Add contact
            <ChevronDown size={13} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && (
            <>
              <ClickAway onClose={() => setMenuOpen(false)} />
              <div
                role="menu"
                className={`absolute right-0 top-[calc(100%+14px)] z-50 w-[240px] ${menuPanel}`}
              >
                {(["client", "matter", "person", "company", "trust", "estate"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    role="menuitem"
                    onClick={() => startAdd(k)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium text-left hover:bg-[#F4F6FA] transition-colors"
                  >
                    <KindIcon kind={k} />
                    {KIND_LABEL[k]}
                  </button>
                ))}
                <div className="border-t border-[#E6EAF1] my-1.5" />
                <div className="px-3 pt-1 pb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Import contacts</div>
                {(
                  [
                    ["outlook", "From Microsoft Outlook"],
                    ["iphone", "From iPhone / iCloud"],
                    ["ringcentral", "From RingCentral"],
                    ["cards", "From Excel (Cards)"],
                    ["csv", "From a CSV file"],
                  ] as [ImportSource | "cards", string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      if (k === "cards") setCardsImport(true);
                      else setImporting(k);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium text-left hover:bg-[#F4F6FA] transition-colors"
                  >
                    <Download size={14} className="text-muted" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="text-[14.5px] text-muted mb-6">
        {loaded
          ? `${plural(counts.all, "contact", "contacts")} — ${plural(counts.client, "client", "clients")}, ${plural(counts.matter, "matter", "matters")}, ${plural(
              counts.person,
              "person",
              "people"
            )}, ${plural(counts.company, "company", "companies")}`
          : "Loading contacts…"}
      </p>

      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setTypeFilter("");
                setLimit(PAGE);
              }}
              className={tab === t.key ? pageBtnOpenB : pageBtnB}
            >
              {t.label} <span className={tab === t.key ? "text-ink/60" : "text-muted font-normal"}>{loaded ? counts[t.key] : ""}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        {loaded && (typeCounts.length > 0 || typeFilter) && (
          <div className="bg-[#ECEFF6] border border-[#E1E5EE] rounded-full p-1 shadow-[0_2px_6px_-1px_rgba(27,25,26,0.07)]">
            <GenericDropdown
              open={typeOpen}
              setOpen={setTypeOpen}
              align="right"
              trigger={
                <>
                  <Filter size={13} strokeWidth={1.75} />
                  {typeFilter || "All types"}
                </>
              }
            >
              <div className="min-w-[250px] max-h-[min(420px,60vh)] overflow-y-auto">
                <button
                  onClick={() => {
                    setTypeFilter("");
                    setTypeOpen(false);
                    setLimit(PAGE);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-chip transition-colors text-left"
                >
                  All types
                  {!typeFilter && <Check size={14} strokeWidth={2} />}
                </button>
                {typeCounts.map(([t, n]) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTypeFilter(t);
                      setTypeOpen(false);
                      setLimit(PAGE);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-chip transition-colors text-left"
                  >
                    <span className="truncate">{t}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[12px] text-muted font-normal">{n.toLocaleString()}</span>
                      {typeFilter === t && <Check size={14} strokeWidth={2} />}
                    </span>
                  </button>
                ))}
              </div>
            </GenericDropdown>
          </div>
        )}
        <div className="relative w-full sm:w-80 bg-[#ECEFF6] border border-[#E1E5EE] rounded-full p-1 shadow-[0_2px_6px_-1px_rgba(27,25,26,0.07)]">
          <Search size={15} strokeWidth={1.75} className="absolute left-[18px] top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Find a contact..."
            aria-label="Find a contact"
            className="w-full border border-[#E3E7EF] bg-white rounded-full pl-10 pr-9 py-1.5 text-[13.5px] outline-none focus:border-[#C3CBDA] placeholder:text-muted shadow-[0_1px_3px_rgba(27,25,26,0.06)]"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
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
        <div className="mb-5 rounded-xl border border-[#E6EAF1] bg-[#F4F6FA] px-4 py-3 text-[13.5px]">
          People and companies need a database update. Run <span className="font-medium">supabase/migrations/0014_contacts.sql</span> in the
          Supabase SQL editor, then refresh.
        </div>
      )}

      <div className={frameOuter}>
        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2.5">
          <span className={frameTitle}>
            <Bookmark size={15} strokeWidth={1.75} />
            {tab === "all" ? "All contacts" : TABS.find((t) => t.key === tab)?.label}
            {typeFilter ? ` · ${typeFilter}` : ""}
            {loaded ? ` · ${shown.length.toLocaleString()}` : ""}
          </span>
        </div>
        {!loaded ? (
          <div className={`${frameInner} py-14 text-center text-[14px] text-muted`}>Loading contacts…</div>
        ) : shown.length === 0 ? (
          <div className={`${frameInner} py-14 text-center px-6`}>
            <Bookmark size={22} strokeWidth={1.5} className="text-muted mx-auto mb-3" />
            {q ? (
              <>
                <div className="text-[14.5px] font-medium">No contacts match “{query.trim()}”</div>
                <button onClick={() => setQuery("")} className={`${pageBtnB} mt-4 mx-auto`}>
                  Clear search
                </button>
              </>
            ) : (
              <>
                <div className="text-[14.5px] font-medium">{tab === "all" ? "No contacts yet" : `No ${EMPTY_LABEL[tab]} yet`}</div>
                <div className="text-[13px] text-muted mt-1 mb-5">{EMPTY_HINT[tab]}</div>
                {tab === "all" ? (
                  <button onClick={() => setMenuOpen(true)} className={`${pageBtnB} mx-auto`}>
                    <Plus size={14} /> Add contact
                  </button>
                ) : (
                  <button onClick={() => startAdd(tab === "vendor" || tab === "government" ? "company" : tab === "trustEstate" ? "trust" : tab)} className={`${pageBtnB} mx-auto`}>
                    <Plus size={14} /> Add {tab === "vendor" ? "vendor" : tab === "government" ? "government office" : tab === "trustEstate" ? "trust" : KIND_LABEL[tab].toLowerCase()}
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={`${frameInner} p-2 flex flex-col gap-1.5`}>
            {shown.slice(0, limit).map((r) => (
              <button
                key={r.key}
                onClick={() => open(r)}
                className="w-full flex items-center gap-3.5 px-4 py-3 text-left rounded-xl bg-[#F4F6FA] border border-[#E6EAF1] hover:bg-[#EAEEF5] transition-colors"
              >
                <Avatar kind={r.kind} name={r.name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14.5px] font-medium truncate">{r.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-[#E1E5EE] text-[11.5px] font-medium text-ink flex-shrink-0">
                      {KIND_LABEL[r.kind]}
                    </span>
                    {r.tag && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium flex-shrink-0 border ${
                          r.cat === "vendor"
                            ? "bg-[#FFF4E5] border-[#F6D4A6] text-[#8A4B14]"
                            : r.cat === "government"
                              ? "bg-[#EAF0FB] border-[#C5D3EE] text-[#2D4F8A]"
                              : "bg-[#E8F6EE] border-[#B9D6B2] text-[#1F7A4D]"
                        }`}
                      >
                        {r.tag}
                      </span>
                    )}
                  </div>
                  {r.detail.length > 0 && <div className="text-[12.5px] text-muted truncate">{r.detail.join(" · ")}</div>}
                </div>
                <span className="text-[12.5px] text-muted flex-shrink-0 hidden sm:block">{r.updatedAt ? formatUpdatedAt(r.updatedAt) : ""}</span>
                <ChevronRight size={16} strokeWidth={1.75} className="text-muted flex-shrink-0" />
              </button>
            ))}
            {shown.length > limit && (
              <button onClick={() => setLimit((l) => l + PAGE * 2)} className={`${pageBtnB} mx-auto my-2`}>
                Show more ({(shown.length - limit).toLocaleString()} more)
              </button>
            )}
          </div>
        )}
      </div>

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
      {(adding === "person" || adding === "company" || adding === "trust" || adding === "estate") &&
        (setupRequired ? (
          <SetupModal onClose={() => setAdding(null)} />
        ) : (
          <ContactModal
            initialKind={adding as ContactKind}
            clients={clients}
            matters={matters}
            companies={companyList}
            onClose={() => setAdding(null)}
            onSave={(input) => saveContact(input)}
          />
        ))}
      {cardsImport && <CardsImportModal onClose={() => setCardsImport(false)} onImported={() => setReloadKey((k) => k + 1)} />}
      {importing && <ImportContactsModal source={importing} onClose={() => setImporting(null)} onImported={() => setReloadKey((k) => k + 1)} />}
      {conflictOpen && (
        <RunConflictModal
          showPastLink
          onClose={() => setConflictOpen(false)}
          onDone={(c) => {
            setConflictOpen(false);
            router.push(`/dashboard/conflict-checks?check=${c.id}`); // the result, with every match
          }}
        />
      )}
      {editingContact && (
        <ContactModal
          contact={editingContact}
          key={editingContact.id}
          initialKind={editingContact.kind}
          clients={clients}
          matters={matters}
          companies={companyList}
          allContacts={contacts}
          onOpenContact={(c) => setEditingContact(c)}
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
  if (kind === "trust") return <Landmark {...p} />;
  if (kind === "estate") return <ScrollText {...p} />;
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
    // Matters and companies: dark slate circle with a white icon (as visible as the people's initials).
    <span className="w-8 h-8 rounded-full bg-[#5E6E8C] flex items-center justify-center flex-shrink-0">
      {kind === "matter" ? (
        <Briefcase size={15} strokeWidth={1.9} className="text-white" />
      ) : kind === "trust" ? (
        <Landmark size={15} strokeWidth={1.9} className="text-white" />
      ) : kind === "estate" ? (
        <ScrollText size={15} strokeWidth={1.9} className="text-white" />
      ) : (
        <Building2 size={15} strokeWidth={1.9} className="text-white" />
      )}
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
