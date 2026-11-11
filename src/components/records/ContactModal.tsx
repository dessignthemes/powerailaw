"use client";

import MatterLinks from "@/components/matters/MatterLinks";
import { useEffect, useState } from "react";
import { X, Loader2, Trash2, User, Building2, Landmark, ScrollText, Users, UserPlus, Search } from "lucide-react";
import SelectBox from "@/components/SelectBox";
import { COMPANY_ROLES, PERSON_ROLES, VENDOR_TYPES, GOVERNMENT_TYPES, KIND_NAMES, type Contact, type ContactCategory, type ContactInput, type ContactKind } from "@/lib/records/contactTypes";

const field =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none focus:border-ink placeholder:text-muted";

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-medium mb-1.5">{children}</div>;
}

export default function ContactModal({
  contact,
  initialKind,
  clients,
  matters,
  onClose,
  onSave,
  onDelete,
  companies = [],
  allContacts = [],
  onOpenContact,
  onSetEmployer,
}: {
  contact?: Contact;
  companies?: { id: string; name: string; category?: ContactCategory }[]; // for "Works at"
  allContacts?: Contact[]; // to list a company's people
  onOpenContact?: (c: Contact) => void;
  // Put someone already in Contacts at this company (employerId), or take them off it (null);
  // { name } adds a new person here.
  onSetEmployer?: (person: Contact | { name: string }, employerId: string | null) => Promise<void>;
  initialKind: ContactKind;
  clients: { id: string; name: string }[];
  matters: { id: string; title: string; matterNumber?: string | null; status: string; clientId?: string | null }[];
  onClose: () => void;
  onSave: (input: ContactInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? initialKind);
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [clientId, setClientId] = useState(contact?.clientId ?? "");
  const [matterId, setMatterId] = useState(contact?.matterId ?? "");
  const [category, setCategory] = useState<ContactCategory>(contact?.category ?? "");
  const [vendorType, setVendorType] = useState(contact?.vendorType ?? "");
  const [employerId, setEmployerId] = useState<string | null>(contact?.employerId ?? null);
  const [employerQuery, setEmployerQuery] = useState("");
  const [mobile, setMobile] = useState(contact?.mobile ?? "");
  const employer = companies.find((c) => c.id === employerId) ?? null;
  const employerMatches = employerQuery.trim()
    ? companies.filter((c) => c.id !== contact?.id && c.name.toLowerCase().includes(employerQuery.trim().toLowerCase())).slice(0, 8)
    : [];
  const people = contact && kind === "company" ? allContacts.filter((c) => c.employerId === contact.id) : [];
  // "+ Add person" under People at this company: pick from Contacts (or add a new one).
  const [addingPerson, setAddingPerson] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [linking, setLinking] = useState<string | null>(null);
  const personMatches = (() => {
    const words = personQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !contact) return [];
    const out: Contact[] = [];
    for (const c of allContacts) {
      if (c.kind !== "person" || c.employerId === contact.id) continue;
      const hay = `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.company}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push(c);
      if (out.length >= 8) break;
    }
    return out;
  })();
  const companyName = (id: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? "" : "");
  async function link(person: Contact | { name: string }, employer: string | null) {
    if (!onSetEmployer) return;
    const key = "id" in person ? person.id : "new";
    setLinking(key);
    setError(null);
    try {
      await onSetEmployer(person, employer);
      if (employer) setPersonQuery("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLinking(null);
    }
  }
  const [saving, setSaving] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = kind === "person" ? PERSON_ROLES : COMPANY_ROLES;
  const isEdit = !!contact;
  const noun = KIND_NAMES[kind].toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  async function save() {
    if (!name.trim()) {
      setError(`Enter the ${noun}'s name.`);
      return;
    }
    setSaving("save");
    setError(null);
    try {
      await onSave({
        kind,
        name: name.trim(),
        role,
        company: kind === "person" ? company.trim() : "",
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes,
        clientId: clientId || null,
        matterId: matterId || null,
        category,
        vendorType: category === "vendor" || category === "government" ? vendorType : "",
        employerId: kind === "person" ? employerId : null,
        mobile: mobile.trim() || null,
      });
    } catch (e) {
      setError((e as Error).message);
      setSaving(null);
    }
  }

  async function remove() {
    if (!onDelete || !confirm(`Delete ${name || "this record"}? This can't be undone.`)) return;
    setSaving("delete");
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError((e as Error).message);
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8" onClick={() => !saving && onClose()}>
      <div
        className="bg-cream rounded-2xl w-full max-w-[560px] max-h-full overflow-y-auto p-7 "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-[20px] font-semibold">{isEdit ? `Edit ${noun}` : `Add ${noun}`}</h2>
          <button onClick={onClose} disabled={!!saving} className="text-muted hover:text-ink disabled:opacity-40" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Type */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(["person", "company", "trust", "estate"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                if (!(k === "person" ? PERSON_ROLES : COMPANY_ROLES).includes(role)) setRole("");
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium border border-btn transition-colors ${
                kind === k ? "bg-btn text-ink" : "bg-chip hover:bg-btn text-ink"
              }`}
            >
              {k === "person" ? <User size={14} strokeWidth={1.75} /> : k === "company" ? <Building2 size={14} strokeWidth={1.75} /> : k === "trust" ? <Landmark size={14} strokeWidth={1.75} /> : <ScrollText size={14} strokeWidth={1.75} />}
              {KIND_NAMES[k]}
            </button>
          ))}
        </div>

        {/* Client (checked for conflicts) or vendor */}
        <div className="mb-5 rounded-xl bg-[#F3F2F0] border border-[#EBEAE7] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium mr-1">Group</span>
            {([
              ["client", "Client"],
              ["vendor", "Vendor / supplier"],
              ["government", "Government"],
              ["other", "Other"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  setCategory(category === k ? "" : k);
                  if (category !== k && (category === "vendor" || category === "government")) setVendorType(""); // types differ per group
                }}
                className={`px-3 py-1 rounded-full text-[12.5px] font-medium border transition-colors ${
                  category === k ? "bg-btn border-btn text-ink" : "bg-white border-[#E3E0DB] text-ink hover:bg-chip"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-muted mt-1.5">
            {category === "client"
              ? "Clients are included in conflict-of-interest checks."
              : category === "vendor"
                ? "Vendors are companies (and their people) the firm works with: title companies, law firms, lenders…"
                : category === "government"
                  ? "Courts, county clerks, townships, tax offices and state or federal agencies (and the people who work there)."
                  : "Pick Client for anyone the firm represents (they're checked for conflicts), or Vendor for title companies, law firms, lenders and the like."}
          </div>
          {(category === "vendor" || category === "government") && (() => {
            const types = category === "government" ? GOVERNMENT_TYPES : VENDOR_TYPES;
            const label = category === "government" ? "Office type" : "Vendor type";
            return (
              <div className="mt-2.5 max-w-[280px]">
                <SelectBox label={label} value={vendorType} onChange={setVendorType}>
                  <option value="">{label}</option>
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {vendorType && !types.includes(vendorType) && <option value={vendorType}>{vendorType}</option>}
                </SelectBox>
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "person" ? "Full name" : "Company name"}
              className={field}
            />
          </div>
          <div>
            <Label>Role</Label>
            <SelectBox label="Role" value={role} onChange={setRole}>
              <option value="">Choose a role</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              {role && !roles.includes(role) && <option value={role}>{role}</option>}
            </SelectBox>
          </div>
          {kind === "person" ? (
            <div className="relative">
              <Label>Works at</Label>
              {employer ? (
                <div className={`${field} flex items-center justify-between gap-2`}>
                  <span className="flex items-center gap-1.5 truncate"><Building2 size={14} className="text-muted flex-shrink-0" /> {employer.name}</span>
                  <button onClick={() => setEmployerId(null)} className="text-muted hover:text-ink flex-shrink-0" aria-label="Remove company"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <input
                    value={employerQuery || company}
                    onChange={(e) => {
                      setEmployerQuery(e.target.value);
                      setCompany(e.target.value);
                    }}
                    placeholder="Company in Contacts, or type a name"
                    className={field}
                  />
                  {employerMatches.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white rounded-xl border border-[#E9E7E4] p-1 max-h-[220px] overflow-y-auto">
                      {employerMatches.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setEmployerId(c.id);
                            setCompany(c.name);
                            setEmployerQuery("");
                            if (!category && c.category) setCategory(c.category);
                          }}
                          className="w-full text-left px-3 py-1.5 rounded-lg text-[13px] hover:bg-[#F3F2F0] flex items-center gap-1.5"
                        >
                          <Building2 size={13} className="text-muted" /> {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div />
          )}
          <div>
            <Label>Email</Label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={field} />
          </div>
          <div>
            <Label>Phone</Label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={field} />
          </div>
          <div>
            <Label>Mobile</Label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" className={field} />
          </div>
          {contact && (contact.workPhone || contact.homePhone || contact.fax || contact.shortName) ? (
            <div className="text-[12.5px] text-muted self-end pb-1">
              {[contact.shortName && `Short name: ${contact.shortName}`, contact.workPhone && `Work: ${contact.workPhone}`, contact.homePhone && `Home: ${contact.homePhone}`, contact.fax && `Fax: ${contact.fax}`].filter(Boolean).join(" · ")}
            </div>
          ) : (
            <div />
          )}
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" className={field} />
          </div>
          {!isEdit && (
          <div>
            <Label>Matter</Label>
            <SelectBox label="Matter" value={matterId} onChange={setMatterId}>
              <option value="">No matter</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </SelectBox>
          </div>
          )}
          <div>
            <Label>Client</Label>
            <SelectBox label="Client" value={clientId} onChange={setClientId}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything worth remembering"
              className={`${field} resize-y`}
            />
          </div>
        </div>

        {/* A company's people (e.g. everyone at a title company or law firm). */}
        {isEdit && kind === "company" && (
          <div className="mt-5 pt-4 border-t border-line">
            <div className="text-[13px] font-medium mb-2 flex items-center gap-1.5">
              <Users size={14} /> People at {name || "this company"} · {people.length}
            </div>
            {people.length === 0 ? (
              <div className="text-[12.5px] text-muted">No one yet.{onSetEmployer ? " Use Add person to pick someone from Contacts." : " Open a person and pick this company under “Works at”."}</div>
            ) : (
              <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                {people.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 rounded-lg bg-[#F3F2F0] border border-[#EBEAE7] hover:bg-[#EFEEEB]">
                    <button onClick={() => onOpenContact?.(p)} className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px]">
                      <span className="truncate">{p.name}</span>
                      <span className="text-[12px] text-muted truncate">{[p.role, p.email, p.phone].filter(Boolean).join(" · ")}</span>
                    </button>
                    {onSetEmployer && (
                      <button
                        onClick={() => void link(p, null)}
                        disabled={!!linking}
                        title={`Take ${p.name} off ${name || "this company"} (the person stays in Contacts)`}
                        aria-label={`Take ${p.name} off this company`}
                        className="w-7 h-7 mr-1 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-white flex-shrink-0 disabled:opacity-50"
                      >
                        {linking === p.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {onSetEmployer && contact && (
              <div className="mt-2">
                {!addingPerson ? (
                  <button
                    onClick={() => setAddingPerson(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium bg-chip border border-btn hover:bg-btn transition-colors"
                  >
                    <UserPlus size={13} /> Add person
                  </button>
                ) : (
                  <div className="rounded-xl border border-[#EBEAE7] bg-white p-2">
                    <div className="flex items-center gap-2 bg-chip rounded-full px-3 py-1.5">
                      <Search size={13} className="text-muted flex-shrink-0" />
                      <input
                        autoFocus
                        value={personQuery}
                        onChange={(e) => setPersonQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && (setAddingPerson(false), setPersonQuery(""))}
                        placeholder="Search people in Contacts by name, email or phone"
                        aria-label="Search people in Contacts"
                        className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
                      />
                      <button onClick={() => (setAddingPerson(false), setPersonQuery(""))} aria-label="Close" className="text-muted hover:text-ink">
                        <X size={13} />
                      </button>
                    </div>
                    {personQuery.trim() && (
                      <div className="mt-1.5 flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                        {personMatches.map((c) => {
                          const at = companyName(c.employerId) || c.company;
                          return (
                            <button
                              key={c.id}
                              onClick={() => void link(c, contact.id)}
                              disabled={!!linking}
                              className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg hover:bg-[#F3F2F0] text-left text-[13px] disabled:opacity-50"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{c.name}</span>
                                <span className="block truncate text-[11.5px] text-muted">
                                  {[at ? `now at ${at} (moves here)` : "", c.email, c.phone].filter(Boolean).join(" · ") || "No company yet"}
                                </span>
                              </span>
                              {linking === c.id ? <Loader2 size={13} className="animate-spin flex-shrink-0" /> : <span className="text-[12px] text-muted flex-shrink-0">Add</span>}
                            </button>
                          );
                        })}
                        {personMatches.length === 0 && <div className="px-3 py-1.5 text-[12.5px] text-muted">No one in Contacts matches “{personQuery.trim()}”.</div>}
                        <button
                          onClick={() => void link({ name: personQuery.trim() }, contact.id)}
                          disabled={!!linking || personQuery.trim().length < 2}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#F3F2F0] text-left text-[12.5px] text-muted hover:text-ink disabled:opacity-50"
                        >
                          {linking === "new" ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Add “{personQuery.trim()}” as a new person here
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* A saved contact can be on many matters, each with its own role. */}
        {isEdit && contact && (
          <div className="mt-5 pt-4 border-t border-line">
            <MatterLinks who={{ kind: "contact", id: contact.id, name: contact.name }} matters={matters} title="Matters" />
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}

        <div className="flex items-center gap-2 mt-6">
          {isEdit && onDelete && (
            <button
              onClick={remove}
              disabled={!!saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {saving === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={1.75} />}
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={!!saving}
            className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!!saving}
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors disabled:opacity-60"
          >
            {saving === "save" && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save" : `Add ${noun}`}
          </button>
        </div>
      </div>
    </div>
  );
}
