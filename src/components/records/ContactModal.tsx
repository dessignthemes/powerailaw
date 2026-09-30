"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Trash2, User, Building2 } from "lucide-react";
import SelectBox from "@/components/SelectBox";
import { COMPANY_ROLES, PERSON_ROLES, type Contact, type ContactInput, type ContactKind } from "@/lib/records/contactTypes";

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
}: {
  contact?: Contact;
  initialKind: ContactKind;
  clients: { id: string; name: string }[];
  matters: { id: string; title: string }[];
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
  const [saving, setSaving] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = kind === "person" ? PERSON_ROLES : COMPANY_ROLES;
  const isEdit = !!contact;
  const noun = kind === "person" ? "person" : "company";

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
        className="bg-cream rounded-2xl w-full max-w-[560px] max-h-full overflow-y-auto p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-[20px] font-semibold">{isEdit ? `Edit ${noun}` : `Add ${noun}`}</h2>
          <button onClick={onClose} disabled={!!saving} className="text-muted hover:text-ink disabled:opacity-40" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {!isEdit && (
          <div className="flex gap-2 mb-5">
            {(["person", "company"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  if (!(k === "person" ? PERSON_ROLES : COMPANY_ROLES).includes(role)) setRole("");
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
                  kind === k ? "bg-btn text-ink ring-1 ring-inset ring-btn-ring" : "bg-card-alt hover:bg-line/70 text-ink"
                }`}
              >
                {k === "person" ? <User size={14} strokeWidth={1.75} /> : <Building2 size={14} strokeWidth={1.75} />}
                {k === "person" ? "Person" : "Company"}
              </button>
            ))}
          </div>
        )}

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
            <div>
              <Label>Company</Label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Where they work" className={field} />
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
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" className={field} />
          </div>
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
            className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50"
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
