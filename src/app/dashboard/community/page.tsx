"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Search,
  X,
  Send,
  Inbox as InboxIcon,
  Check,
  MapPin,
  Briefcase,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

// ── Prototype data ────────────────────────────────────────────────────────
// Everything on this page is sample data held in memory. Nothing is saved
// yet; a real version needs lawyer profiles + a referrals table in Supabase.

type Availability = "Taking clients" | "Limited" | "Full";

type Lawyer = {
  id: string;
  name: string;
  firm: string;
  areas: string[];
  location: string;
  years: number;
  languages: string[];
  availability: Availability;
  bio: string;
  referralsHandled: number;
};

type Urgency = "Standard" | "Urgent";
type ReferralStatus = "Pending" | "Accepted" | "Declined";

type Referral = {
  id: string;
  direction: "sent" | "received";
  lawyerId: string; // the other lawyer
  clientName: string;
  clientContact: string;
  area: string;
  summary: string;
  urgency: Urgency;
  status: ReferralStatus;
  createdAt: string;
  addedToClients?: boolean;
};

const practiceAreas = [
  "Criminal defence",
  "Tax",
  "Family",
  "Immigration",
  "Employment",
  "Real estate",
  "Corporate",
  "Personal injury",
  "Estate planning",
  "Intellectual property",
];

const lawyers: Lawyer[] = [
  {
    id: "l1",
    name: "Daniel Okafor",
    firm: "Okafor Defence Chambers",
    areas: ["Criminal defence"],
    location: "Downtown",
    years: 14,
    languages: ["English", "Yoruba"],
    availability: "Taking clients",
    bio: "Former prosecutor. Handles bail hearings, fraud and assault charges, and appeals.",
    referralsHandled: 23,
  },
  {
    id: "l2",
    name: "Priya Raman",
    firm: "Raman Tax Law",
    areas: ["Tax", "Corporate"],
    location: "Financial District",
    years: 11,
    languages: ["English", "Tamil"],
    availability: "Limited",
    bio: "Tax audits, voluntary disclosures and cross-border structuring for small businesses.",
    referralsHandled: 17,
  },
  {
    id: "l3",
    name: "Sofia Marchetti",
    firm: "Marchetti Family Law",
    areas: ["Family"],
    location: "North End",
    years: 9,
    languages: ["English", "Italian"],
    availability: "Taking clients",
    bio: "Separation, custody and support. Trained mediator for collaborative settlements.",
    referralsHandled: 31,
  },
  {
    id: "l4",
    name: "Ahmed Siddiqui",
    firm: "Siddiqui Immigration",
    areas: ["Immigration"],
    location: "Westside",
    years: 12,
    languages: ["English", "Urdu", "Arabic"],
    availability: "Taking clients",
    bio: "Work permits, family sponsorship, refugee claims and removal appeals.",
    referralsHandled: 28,
  },
  {
    id: "l5",
    name: "Hannah Brooks",
    firm: "Brooks Employment Counsel",
    areas: ["Employment"],
    location: "Downtown",
    years: 7,
    languages: ["English"],
    availability: "Full",
    bio: "Wrongful dismissal, workplace harassment and severance negotiations for employees.",
    referralsHandled: 12,
  },
  {
    id: "l6",
    name: "Marcus Lee",
    firm: "Lee & Partners",
    areas: ["Real estate", "Corporate"],
    location: "Midtown",
    years: 16,
    languages: ["English", "Cantonese"],
    availability: "Limited",
    bio: "Commercial leases, purchases and closings, and shareholder agreements.",
    referralsHandled: 19,
  },
  {
    id: "l7",
    name: "Grace Nwosu",
    firm: "Nwosu Injury Law",
    areas: ["Personal injury"],
    location: "East End",
    years: 10,
    languages: ["English", "Igbo"],
    availability: "Taking clients",
    bio: "Car accidents, slip-and-fall and long-term disability claims. Contingency fees.",
    referralsHandled: 26,
  },
  {
    id: "l8",
    name: "Tomasz Kowalski",
    firm: "Kowalski Estates",
    areas: ["Estate planning"],
    location: "Northside",
    years: 20,
    languages: ["English", "Polish"],
    availability: "Taking clients",
    bio: "Wills, powers of attorney, probate and estate disputes.",
    referralsHandled: 34,
  },
  {
    id: "l9",
    name: "Elena Vasquez",
    firm: "Vasquez IP",
    areas: ["Intellectual property", "Corporate"],
    location: "Tech Park",
    years: 8,
    languages: ["English", "Spanish"],
    availability: "Taking clients",
    bio: "Trademarks, licensing and IP for startups and creative businesses.",
    referralsHandled: 9,
  },
  {
    id: "l10",
    name: "Robert Chen",
    firm: "Chen Criminal & Regulatory",
    areas: ["Criminal defence", "Tax"],
    location: "Financial District",
    years: 18,
    languages: ["English", "Mandarin"],
    availability: "Limited",
    bio: "White-collar and regulatory offences, including tax evasion prosecutions.",
    referralsHandled: 21,
  },
];

const seedReferrals: Referral[] = [
  {
    id: "r1",
    direction: "received",
    lawyerId: "l3",
    clientName: "Jordan Pike",
    clientContact: "jordan.pike@example.com",
    area: "Tax",
    summary:
      "Client is going through a divorce and needs advice on the tax impact of selling the family business.",
    urgency: "Standard",
    status: "Pending",
    createdAt: "2026-09-21T15:10:00Z",
  },
  {
    id: "r2",
    direction: "received",
    lawyerId: "l4",
    clientName: "Mei Tanaka",
    clientContact: "(555) 014-2290",
    area: "Employment",
    summary: "Work-permit holder dismissed without notice. Wants to know her options before her permit is affected.",
    urgency: "Urgent",
    status: "Pending",
    createdAt: "2026-09-22T09:40:00Z",
  },
  {
    id: "r3",
    direction: "sent",
    lawyerId: "l1",
    clientName: "Chris Duarte",
    clientContact: "chris.d@example.com",
    area: "Criminal defence",
    summary: "Existing tax client was charged with assault last night. Needs a bail hearing this week.",
    urgency: "Urgent",
    status: "Accepted",
    createdAt: "2026-09-19T18:05:00Z",
  },
];

const availabilityStyle: Record<Availability, string> = {
  "Taking clients": "bg-[#DCEBD8] text-[#2F5E2A]",
  Limited: "bg-[#F5E3B3] text-[#8A6D1D]",
  Full: "bg-[#EAE8E0] text-[#6B675F]",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const [tab, setTab] = useState<"directory" | "referrals">("directory");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>(seedReferrals);
  const [referTo, setReferTo] = useState<Lawyer | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pendingReceived = referrals.filter((r) => r.direction === "received" && r.status === "Pending").length;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lawyers
      .filter((l) => !area || l.areas.includes(area))
      .filter(
        (l) =>
          !q ||
          l.name.toLowerCase().includes(q) ||
          l.firm.toLowerCase().includes(q) ||
          l.areas.some((a) => a.toLowerCase().includes(q)) ||
          l.languages.some((a) => a.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const rank = { "Taking clients": 0, Limited: 1, Full: 2 };
        return rank[a.availability] - rank[b.availability];
      });
  }, [query, area]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  function sendReferral(r: Omit<Referral, "id" | "direction" | "status" | "createdAt">) {
    setReferrals((rs) => [
      {
        ...r,
        id: crypto.randomUUID(),
        direction: "sent",
        status: "Pending",
        createdAt: new Date().toISOString(),
      },
      ...rs,
    ]);
    const to = lawyers.find((l) => l.id === r.lawyerId);
    setReferTo(null);
    flash(`Referral sent to ${to?.name ?? "colleague"}.`);
  }

  function setStatus(id: string, status: ReferralStatus) {
    setReferrals((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  return (
    <div className="px-10 py-10 max-w-[1180px]">
      <div className="mb-8">
        <h1 className="text-[32px] font-semibold mb-1">Community</h1>
        <p className="text-[14.5px] text-muted max-w-[620px]">
          When a client needs a lawyer outside your practice area, find the right colleague here and hand them over
          with the context they need.
        </p>
      </div>

      <div className="flex gap-6 mb-7 text-[14px] font-medium text-muted border-b border-line">
        <button
          onClick={() => setTab("directory")}
          className={`pb-3 flex items-center gap-1.5 transition-colors ${
            tab === "directory" ? "text-ink border-b-2 border-ink font-semibold" : "hover:text-ink"
          }`}
        >
          <Users size={15} strokeWidth={tab === "directory" ? 2 : 1.75} /> Find a lawyer
        </button>
        <button
          onClick={() => setTab("referrals")}
          className={`pb-3 flex items-center gap-1.5 transition-colors ${
            tab === "referrals" ? "text-ink border-b-2 border-ink font-semibold" : "hover:text-ink"
          }`}
        >
          <InboxIcon size={15} strokeWidth={tab === "referrals" ? 2 : 1.75} /> Referrals
          {pendingReceived > 0 && (
            <span className="ml-1 bg-dark text-white text-[11px] font-semibold rounded-full px-1.5 min-w-[18px] text-center">
              {pendingReceived}
            </span>
          )}
        </button>
      </div>

      {tab === "directory" ? (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-line rounded-full px-4 py-2 w-full max-w-[380px]">
              <Search size={15} strokeWidth={1.75} className="text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, firm, practice area or language"
                className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-7 flex-wrap">
            <button
              onClick={() => setArea(null)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                area === null ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
              }`}
            >
              All areas
            </button>
            {practiceAreas.map((a) => (
              <button
                key={a}
                onClick={() => setArea(area === a ? null : a)}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  area === a ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="bg-card-alt rounded-2xl p-2">
            {results.length === 0 ? (
              <div className="bg-cream rounded-xl py-16 text-center text-[14px] text-muted">
                No colleagues match that search yet.
              </div>
            ) : (
              <div className="bg-cream rounded-xl divide-y divide-line">
                {results.map((l) => (
                  <div key={l.id} className="flex items-start gap-4 px-5 py-5 flex-wrap md:flex-nowrap">
                    <div className="w-11 h-11 rounded-full bg-dark text-white flex items-center justify-center text-[14px] font-semibold flex-shrink-0">
                      {initials(l.name)}
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[15.5px] font-semibold">{l.name}</span>
                        <span
                          className={`text-[11.5px] font-medium px-2 py-0.5 rounded-full ${availabilityStyle[l.availability]}`}
                        >
                          {l.availability}
                        </span>
                      </div>
                      <div className="text-[13px] text-muted mb-2 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Briefcase size={12} strokeWidth={1.75} /> {l.firm}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={12} strokeWidth={1.75} /> {l.location}
                        </span>
                        <span>{l.years} years in practice</span>
                      </div>
                      <p className="text-[14px] leading-relaxed max-w-[620px] mb-2.5">{l.bio}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {l.areas.map((a) => (
                          <span key={a} className="text-[12px] font-medium bg-card-alt px-2.5 py-1 rounded-full">
                            {a}
                          </span>
                        ))}
                        <span className="text-[12px] text-muted ml-1">Speaks {l.languages.join(", ")}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-auto">
                      <button
                        onClick={() => setReferTo(l)}
                        disabled={l.availability === "Full"}
                        className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send size={13} strokeWidth={2} /> Refer a client
                      </button>
                      <span className="text-[12px] text-muted">{l.referralsHandled} referrals handled</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <ReferralsView referrals={referrals} onStatus={setStatus} setReferrals={setReferrals} flash={flash} />
      )}

      {referTo && (
        <ReferModal lawyer={referTo} defaultArea={area} onClose={() => setReferTo(null)} onSend={sendReferral} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-dark text-white text-[13.5px] font-medium px-4 py-2.5 rounded-full flex items-center gap-2 shadow-lg">
          <Check size={14} strokeWidth={2} /> {toast}
        </div>
      )}
    </div>
  );
}

// ── Referrals list ────────────────────────────────────────────────────────

function ReferralsView({
  referrals,
  onStatus,
  setReferrals,
  flash,
}: {
  referrals: Referral[];
  onStatus: (id: string, s: ReferralStatus) => void;
  setReferrals: React.Dispatch<React.SetStateAction<Referral[]>>;
  flash: (m: string) => void;
}) {
  const { addClient } = useWorkspaceData();
  const received = referrals.filter((r) => r.direction === "received");
  const sent = referrals.filter((r) => r.direction === "sent");

  function addToClients(r: Referral) {
    const isEmail = r.clientContact.includes("@");
    addClient({
      id: crypto.randomUUID(),
      name: r.clientName,
      description: `Referred by ${lawyers.find((l) => l.id === r.lawyerId)?.name ?? "a colleague"} (${r.area}). ${r.summary}`,
      status: "Active",
      type: "Individual",
      email: isEmail ? r.clientContact : null,
      phone: isEmail ? null : r.clientContact,
      address: null,
      matterCount: 0,
      updatedAt: new Date().toISOString(),
    });
    setReferrals((rs) => rs.map((x) => (x.id === r.id ? { ...x, addedToClients: true } : x)));
    flash(`${r.clientName} added to Clients.`);
  }

  function renderSection(title: string, items: Referral[], empty: string) {
    return (
      <div className="mb-8">
        <h2 className="text-[16px] font-semibold mb-3">{title}</h2>
        <div className="bg-card-alt rounded-2xl p-2">
          {items.length === 0 ? (
            <div className="bg-cream rounded-xl py-10 text-center text-[14px] text-muted">{empty}</div>
          ) : (
            <div className="bg-cream rounded-xl divide-y divide-line">
              {items.map((r) => {
                const other = lawyers.find((l) => l.id === r.lawyerId);
                return (
                  <div key={r.id} className="px-5 py-4 flex items-start gap-4 flex-wrap md:flex-nowrap">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[15px] font-semibold">{r.clientName}</span>
                        <span className="text-[12px] font-medium bg-card-alt px-2.5 py-0.5 rounded-full">{r.area}</span>
                        {r.urgency === "Urgent" && (
                          <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full bg-[#F6C9C0] text-[#9C3A24]">
                            Urgent
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-muted mb-1.5">
                        {r.direction === "received" ? "From" : "To"} {other?.name ?? "Unknown"}, {shortDate(r.createdAt)}
                      </div>
                      <p className="text-[14px] leading-relaxed max-w-[640px]">{r.summary}</p>
                      {r.status === "Accepted" && (
                        <div className="text-[13px] text-muted mt-1.5">Client contact: {r.clientContact}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                      {r.direction === "received" && r.status === "Pending" ? (
                        <>
                          <button
                            onClick={() => onStatus(r.id, "Declined")}
                            className="px-3.5 py-1.5 rounded-full text-[13px] font-medium bg-card-alt text-muted hover:text-ink transition-colors"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => onStatus(r.id, "Accepted")}
                            className="px-3.5 py-1.5 rounded-full text-[13px] font-medium bg-dark text-white hover:bg-dark2 transition-colors"
                          >
                            Accept
                          </button>
                        </>
                      ) : r.direction === "received" && r.status === "Accepted" && !r.addedToClients ? (
                        <button
                          onClick={() => addToClients(r)}
                          className="px-3.5 py-1.5 rounded-full text-[13px] font-medium bg-dark text-white hover:bg-dark2 transition-colors flex items-center gap-1.5"
                        >
                          <UserPlus size={13} strokeWidth={2} /> Add to Clients
                        </button>
                      ) : (
                        <span
                          className={`text-[12.5px] font-medium px-2.5 py-1 rounded-full ${
                            r.status === "Accepted"
                              ? "bg-[#DCEBD8] text-[#2F5E2A]"
                              : r.status === "Declined"
                              ? "bg-[#EAE8E0] text-[#6B675F]"
                              : "bg-[#F5E3B3] text-[#8A6D1D]"
                          }`}
                        >
                          {r.addedToClients ? "In your Clients" : r.status === "Pending" ? "Awaiting reply" : r.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderSection("Sent to you", received, "No one has referred a client to you yet.")}
      {renderSection("You referred", sent, "Referrals you send will show up here.")}
    </>
  );
}

// ── Refer modal ───────────────────────────────────────────────────────────

function ReferModal({
  lawyer,
  defaultArea,
  onClose,
  onSend,
}: {
  lawyer: Lawyer;
  defaultArea: string | null;
  onClose: () => void;
  onSend: (r: Omit<Referral, "id" | "direction" | "status" | "createdAt">) => void;
}) {
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [area, setArea] = useState(defaultArea && lawyer.areas.includes(defaultArea) ? defaultArea : lawyer.areas[0]);
  const [summary, setSummary] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("Standard");
  const [consent, setConsent] = useState(false);

  const canSend = clientName.trim() && clientContact.trim() && summary.trim() && consent;

  const field =
    "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink transition-colors placeholder:text-muted";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream rounded-3xl w-full max-w-[560px] max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between px-7 pt-6 pb-4">
          <div>
            <h2 className="text-[20px] font-semibold">Refer a client to {lawyer.name}</h2>
            <p className="text-[13.5px] text-muted mt-0.5">{lawyer.firm}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors mt-1">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pb-2 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Client name</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Email or phone</span>
              <input value={clientContact} onChange={(e) => setClientContact(e.target.value)} className={field} />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">What they need help with</span>
            <div className="flex gap-2 flex-wrap">
              {lawyer.areas.map((a) => (
                <button
                  key={a}
                  onClick={() => setArea(a)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    area === a ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Short summary for your colleague</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Key facts, deadlines, and anything they should know before the first call."
              className={`${field} resize-none`}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Urgency</span>
            <div className="flex gap-2">
              {(["Standard", "Urgent"] as Urgency[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUrgency(u)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    urgency === u ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 bg-card-alt rounded-xl px-3.5 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-black"
            />
            <span className="text-[13px] leading-snug">
              <span className="font-medium flex items-center gap-1">
                <ShieldCheck size={13} strokeWidth={1.75} /> The client agreed to be referred
              </span>
              <span className="text-muted">
                Their contact details are only shown to {lawyer.name.split(" ")[0]} after they accept.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-7 py-5 mt-2 border-t border-line">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!canSend}
            onClick={() =>
              onSend({
                lawyerId: lawyer.id,
                clientName: clientName.trim(),
                clientContact: clientContact.trim(),
                area,
                summary: summary.trim(),
                urgency,
              })
            }
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={13} strokeWidth={2} /> Send referral
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
