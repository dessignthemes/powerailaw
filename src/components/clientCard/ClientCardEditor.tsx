"use client";

import ClientAvatar from "@/components/clientCard/ClientAvatar";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Mail, MessageSquare, Phone, Plus, X, User, ChevronRight, ChevronDown, Loader2, Upload, FileText, Eye, EyeOff, Camera, FileSignature, ClipboardList,
} from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import SelectBox from "@/components/SelectBox";
import { uploadAnyDocument, versionDownloadUrl, UploadError } from "@/lib/pdf/upload";
import type { Doc } from "@/components/pdf/DocumentList";
import {
  APT_TYPES, CONTACT_KINDS, CONTACT_PREFERENCES, ENTITY_TYPES, PRACTICE_AREAS, RELATIONSHIP, TITLES, ageFrom, autoLetter, emptyProfile, personName, newPerson, normalizeProfile,
  personFullTitle, type CardType, type ContactLine, type Person, type Profile,
} from "@/lib/clients/card";

type Section = "person" | "intake" | "details" | "address" | "notes" | "documents" | "mailings" | "matters";

const input = "w-full border border-line rounded-lg px-3 py-2 text-[14px] bg-white outline-none focus:border-ink placeholder:text-muted/70";
const smallSelect = "border border-line rounded-lg px-2.5 py-2 text-[13.5px] bg-white outline-none focus:border-ink";

async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? `Request failed (${res.status})`), { code: d?.code });
  return d;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-7 mb-3 first:mt-0">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap">{children}</span>
      <span className="h-px bg-line flex-1" />
    </div>
  );
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`grid grid-cols-[130px_1fr] items-center gap-3 ${wide ? "md:col-span-2" : ""}`}>
      <span className="text-[13.5px] text-muted">{label}</span>
      {children}
    </label>
  );
}
function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="flex gap-1 border-b border-line mb-6">
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`px-3.5 py-2 -mb-px border-b-2 text-[14px] font-medium ${value === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ContactLines({ lines, onChange }: { lines: ContactLine[]; onChange: (l: ContactLine[]) => void }) {
  return (
    <div className="grid gap-2">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr_28px] gap-2 items-center">
          <select value={l.kind} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, kind: e.target.value as ContactLine["kind"] } : x)))} className={smallSelect} aria-label="Contact type">
            {CONTACT_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <input
            value={l.value}
            onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            type={l.kind === "Email" ? "email" : l.kind === "Web" ? "url" : l.kind === "Other" ? "text" : "tel"}
            placeholder={l.kind === "Email" ? "name@example.com" : l.kind === "Web" ? "https://" : ""}
            className={input}
          />
          <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="text-muted hover:text-red-700" aria-label="Remove line">
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lines, { kind: "Phone", value: "" }])} className="text-[13px] font-medium text-muted hover:text-ink flex items-center gap-1 justify-self-start mt-1">
        <Plus size={13} /> Add line
      </button>
    </div>
  );
}

async function shrinkPhoto(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function ClientCardEditor({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { matters, refreshAll } = useWorkspaceData();
  const [cardId, setCardId] = useState<string | null>(id);
  const [cardType, setCardType] = useState<CardType>("person");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [saved, setSaved] = useState<string>(() => JSON.stringify({ t: "person", p: emptyProfile() }));
  const [loaded, setLoaded] = useState(id === null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>("person");
  const [personId, setPersonId] = useState<string>(() => profile.people[0].id);
  const [templates, setTemplates] = useState(false);
  const [docBusy, setDocBusy] = useState<null | "intake">(null);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/client-cards/${id}`)
      .then(readJson)
      .then(({ card, templates: t }) => {
        if (cancelled) return;
        setTemplates(!!t);
        const p = normalizeProfile(card.profile);
        setCardType(card.cardType);
        setProfile(p);
        setPersonId(p.people[0].id);
        setSaved(JSON.stringify({ t: card.cardType, p }));
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dirty = JSON.stringify({ t: cardType, p: profile }) !== saved;
  const person = profile.people.find((p) => p.id === personId) ?? profile.people[0];
  const letter = useMemo(() => autoLetter(cardType, profile), [cardType, profile]);
  const name = cardType === "company" ? profile.company.name || "New company" : personFullTitle(profile.people[0]) || "New client";
  const contactLines = cardType === "company" ? profile.company.contacts : profile.people.flatMap((p) => p.contacts);
  const firstEmail = contactLines.find((l) => l.kind === "Email" && l.value.trim())?.value.trim();
  const firstPhone = contactLines.find((l) => (l.kind === "Cell" || l.kind === "Phone") && l.value.trim())?.value.trim();

  const setP = (fn: (p: Profile) => Profile) => setProfile((p) => fn(structuredClone(p)));
  const setPerson = (patch: Partial<Person>) => setP((p) => ({ ...p, people: p.people.map((x) => (x.id === person.id ? { ...x, ...patch } : x)) }));

  async function save(close: boolean): Promise<string | null> {
    setSaving(true);
    setError(null);
    try {
      const p = structuredClone(profile);
      if (p.letter.titleAuto) p.letter.title = letter.title;
      if (p.letter.dearAuto) p.letter.dear = letter.dear;
      const { card } = await fetch(cardId ? `/api/client-cards/${cardId}` : "/api/client-cards", {
        method: cardId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardType, profile: p }),
      }).then(readJson);
      const np = normalizeProfile(card.profile);
      setCardId(card.id);
      setProfile(np);
      setSaved(JSON.stringify({ t: card.cardType, p: np }));
      refreshAll();
      onSaved(card.id);
      if (close) onClose();
      return card.id as string;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Documents are filled from the saved card, so unsaved changes are saved first.
  async function makeDocument(kind: "intake" | "engagement", extra: Record<string, string> = {}): Promise<{ blob: Blob; filename: string } | null> {
    const id = dirty || !cardId ? await save(false) : cardId;
    if (!id) return null;
    const res = await fetch(`/api/client-cards/${id}/document`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...extra }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error ?? "The document couldn't be created.");
    }
    const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${kind}.docx`;
    return { blob: await res.blob(), filename };
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function intakeSheet() {
    setDocBusy("intake");
    setError(null);
    try {
      const out = await makeDocument("intake");
      if (out) download(out.blob, out.filename);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDocBusy(null);
    }
  }

  function cancel() {
    if (dirty && !confirm("Discard your changes to this card?")) return;
    onClose();
  }

  const nav: [Section, string][] = [
    ["intake", "Intake"],
    ["details", "Details"],
    ["address", "Address"],
    ["notes", "Notes & Other"],
    ["documents", "Documents"],
    ["mailings", "Mailings"],
    ["matters", "Matters"],
  ];

  if (!loaded) return <div className="bg-card-alt rounded-2xl py-16 text-center text-[14px] text-muted">Loading the client card…</div>;

  return (
    <div className="bg-card-alt rounded-2xl overflow-hidden border border-line">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-line bg-cream/60 flex-wrap">
        <button onClick={cancel} className="w-9 h-9 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink" aria-label="Back to clients">
          <ArrowLeft size={18} />
        </button>
        <ClientAvatar name={name} company={cardType === "company"} src={profile.photo} size={56} />
        <div className="flex-1 min-w-[200px]">
          <div className="text-[24px] font-semibold leading-tight">{name}</div>
          <div className="text-[13px] text-muted">{cardType === "company" ? "Company" : `People (${profile.people.length})`}{dirty ? " · unsaved changes" : ""}</div>
        </div>
        {templates && cardId && (
          <div className="flex gap-2">
            <button onClick={intakeSheet} disabled={!!docBusy || saving} className="bg-card-alt hover:bg-line/70 px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50">
              {docBusy === "intake" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />} Intake sheet
            </button>
            <button onClick={() => setEngagementOpen(true)} disabled={saving} className="bg-btn hover:bg-btn-hover px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50">
              <FileSignature size={14} /> Engagement agreement
            </button>
          </div>
        )}
        <div className="flex gap-2">
          {[
            { icon: Mail, label: "Email", href: firstEmail ? `mailto:${firstEmail}` : null },
            { icon: MessageSquare, label: "Message", href: firstPhone ? `sms:${firstPhone.replace(/[^\d+]/g, "")}` : null },
            { icon: Phone, label: "Call", href: firstPhone ? `tel:${firstPhone.replace(/[^\d+]/g, "")}` : null },
          ].map((a) =>
            a.href ? (
              <a key={a.label} href={a.href} className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-card-alt text-[12px] text-muted hover:text-ink">
                <a.icon size={18} strokeWidth={1.75} /> {a.label}
              </a>
            ) : (
              <span key={a.label} title={`Add ${a.label === "Email" ? "an email" : "a phone number"} first`} className="flex flex-col items-center gap-1 px-3 py-1.5 text-[12px] text-muted/50">
                <a.icon size={18} strokeWidth={1.75} /> {a.label}
              </span>
            )
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-[250px_1fr] min-h-[560px]">
        {/* Left panel */}
        <aside className="border-r border-line p-4 flex flex-col gap-5">
          <div>
            <div className="text-[13px] font-semibold mb-1.5">Card type</div>
            <SelectBox label="Card type" value={cardType} onChange={(v) => { setCardType(v as CardType); setSection("person"); }}>
              <option value="person">People</option>
              <option value="company">Company</option>
            </SelectBox>
          </div>
          {cardType === "person" ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-semibold">People ({profile.people.length})</span>
                <button
                  onClick={() => { const np = newPerson(); setP((p) => ({ ...p, people: [...p.people, np] })); setPersonId(np.id); setSection("person"); }}
                  title="Add a person (spouse, co-client…)"
                  className="w-7 h-7 rounded-full hover:bg-line/60 flex items-center justify-center"
                  aria-label="Add person"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="grid gap-1">
                {profile.people.map((p, i) => (
                  <div key={p.id} className={`flex items-center rounded-lg ${section === "person" && p.id === person.id ? "bg-white ring-1 ring-line" : "hover:bg-line/40"}`}>
                    <button onClick={() => { setPersonId(p.id); setSection("person"); }} className="flex-1 text-left px-3 py-2 text-[13.5px] font-medium truncate">
                      {personFullTitle(p) || `Person ${i + 1}`}
                    </button>
                    {profile.people.length > 1 && (
                      <button
                        onClick={() => { if (confirm("Remove this person from the card?")) { setP((x) => ({ ...x, people: x.people.filter((y) => y.id !== p.id) })); setPersonId(profile.people.find((y) => y.id !== p.id)!.id); } }}
                        className="px-2 text-muted hover:text-red-700" aria-label="Remove person"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => setSection("person")} className={`text-left rounded-lg px-3 py-2 text-[13.5px] font-medium ${section === "person" ? "bg-white ring-1 ring-line" : "hover:bg-line/40"}`}>
              {profile.company.name || "Company details"}
            </button>
          )}
          <div className="border-t border-line pt-4">
            <div className="text-[13px] font-semibold mb-1.5">Card details</div>
            <div className="grid gap-0.5">
              {nav.map(([k, l]) => (
                <button key={k} onClick={() => setSection(k)} className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13.5px] ${section === k ? "bg-white ring-1 ring-line font-medium" : "hover:bg-line/40"}`}>
                  {l} <ChevronRight size={14} className="text-muted" />
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Right panel */}
        <section className="bg-white p-6 md:p-8 overflow-x-auto">
          {section === "person" && cardType === "person" && <PersonView person={person} setPerson={setPerson} photo={profile.photo} setPhoto={(ph) => setP((p) => ({ ...p, photo: ph }))} />}
          {section === "person" && cardType === "company" && <CompanyView profile={profile} setP={setP} photo={profile.photo} setPhoto={(ph) => setP((p) => ({ ...p, photo: ph }))} />}
          {section === "intake" && <IntakeView profile={profile} setP={setP} cardType={cardType} />}
          {section === "details" && <DetailsView cardType={cardType} profile={profile} setP={setP} person={person} setPerson={setPerson} auto={letter} />}
          {section === "address" && <AddressView profile={profile} setP={setP} />}
          {section === "notes" && <NotesView profile={profile} setP={setP} />}
          {section === "documents" && <DocumentsView clientId={cardId} matters={matters.filter((m) => m.clientId === cardId)} />}
          {section === "mailings" && <MailingsView clientId={cardId} dirty={dirty} />}
          {section === "matters" && <MattersView clientId={cardId} matters={matters.filter((m) => m.clientId === cardId)} />}
        </section>
      </div>

      {engagementOpen && (
        <EngagementModal
          cardType={cardType}
          profile={profile}
          dear={profile.letter.dearAuto ? letter.dear : profile.letter.dear}
          matters={matters.filter((m) => m.clientId === cardId)}
          onClose={() => setEngagementOpen(false)}
          onCreate={async (opts, matterId) => {
            const out = await makeDocument("engagement", opts);
            if (!out) return;
            download(out.blob, out.filename);
            if (matterId) {
              await uploadAnyDocument(matterId, new File([out.blob], out.filename, { type: out.blob.type }));
              setNotice("Engagement agreement saved to the matter's Documents and downloaded.");
            } else setNotice("Engagement agreement downloaded.");
            setEngagementOpen(false);
          }}
        />
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 px-6 py-4 border-t border-line bg-cream/60 flex-wrap">
        {error && <span className="text-[13px] text-red-700 mr-auto">{error}</span>}
        {!error && notice && <span className="text-[13px] text-green-700 mr-auto">{notice}</span>}
        <div className="ml-auto flex gap-2">
          <button onClick={cancel} disabled={saving} className="bg-card-alt hover:bg-line/70 px-5 py-2 rounded-full text-[13.5px] font-medium disabled:opacity-50">Cancel</button>
          <button onClick={() => save(false)} disabled={saving || (!dirty && !!cardId)} className="bg-card-alt hover:bg-line/70 px-5 py-2 rounded-full text-[13.5px] font-medium disabled:opacity-50">Save</button>
          <button onClick={() => save(true)} disabled={saving} className="bg-btn hover:bg-btn-hover px-5 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 disabled:opacity-60">
            {saving && <Loader2 size={14} className="animate-spin" />} Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

function PhotoBox({ photo, setPhoto }: { photo: string | null; setPhoto: (p: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="w-[150px] h-[150px] rounded-xl border border-line bg-card-alt/50 relative overflow-hidden flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <User size={56} strokeWidth={1.25} className="text-muted/60" />}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPhoto(await shrinkPhoto(f)); }} />
      <button type="button" onClick={() => ref.current?.click()} className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-btn hover:bg-btn-hover flex items-center justify-center shadow" aria-label="Add photo">
        <Camera size={16} />
      </button>
      {photo && (
        <button type="button" onClick={() => setPhoto(null)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center" aria-label="Remove photo">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function PersonView({ person: p, setPerson, photo, setPhoto }: { person: Person; setPerson: (x: Partial<Person>) => void; photo: string | null; setPhoto: (p: string | null) => void }) {
  const [tab, setTab] = useState<"general" | "other" | "extra">("general");
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-3">Personal details</div>
      <Tabs value={tab} onChange={setTab} items={[["general", "General"], ["other", "Other"], ["extra", "Additional Fields"]]} />
      {tab === "general" && (
        <>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            <label className="grid grid-cols-[130px_96px_1fr] items-center gap-2">
              <span className="text-[13.5px] text-muted">First name</span>
              <select value={p.title} onChange={(e) => setPerson({ title: e.target.value })} className={smallSelect} aria-label="Title">
                {TITLES.map((t) => <option key={t} value={t}>{t || "—"}</option>)}
              </select>
              <input value={p.first} onChange={(e) => setPerson({ first: e.target.value })} className={input} />
            </label>
            <Field label="Suffix"><input value={p.suffix} onChange={(e) => setPerson({ suffix: e.target.value })} placeholder="Jr., Sr., III, Esq." className={input} /></Field>
            <Field label="Middle name"><input value={p.middle} onChange={(e) => setPerson({ middle: e.target.value })} className={input} /></Field>
            <Field label="Gender">
              <div className="flex gap-4 text-[13.5px]">
                {(["Male", "Female", "Other"] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5"><input type="radio" checked={p.gender === g} onChange={() => setPerson({ gender: g })} className="accent-black" /> {g}</label>
                ))}
              </div>
            </Field>
            <Field label="Last name"><input value={p.last} onChange={(e) => setPerson({ last: e.target.value })} className={input} /></Field>
            <Field label="Relationship">
              <select value={p.relationship} onChange={(e) => setPerson({ relationship: e.target.value })} className={`${smallSelect} w-full`}>
                {RELATIONSHIP.map((r) => <option key={r} value={r}>{r || "—"}</option>)}
              </select>
            </Field>
            <Field label="Previous names"><input value={p.previousNames} onChange={(e) => setPerson({ previousNames: e.target.value })} className={input} /></Field>
          </div>
          <Heading>Contact</Heading>
          <div className="grid md:grid-cols-[1fr_150px] gap-8 items-start">
            <ContactLines lines={p.contacts} onChange={(contacts) => setPerson({ contacts })} />
            <PhotoBox photo={photo} setPhoto={setPhoto} />
          </div>
          <Heading>Birth / Death</Heading>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Date of birth">
              <div className="flex items-center gap-3">
                <input type="date" value={p.dob} onChange={(e) => setPerson({ dob: e.target.value })} className={input} />
                {p.dob && <span className="text-[12.5px] text-muted whitespace-nowrap">Age {ageFrom(p.dob, p.dod)}</span>}
              </div>
            </Field>
            <Field label="Place of birth"><input value={p.placeOfBirth} onChange={(e) => setPerson({ placeOfBirth: e.target.value })} className={input} /></Field>
            <Field label="Country of birth"><input value={p.countryOfBirth} onChange={(e) => setPerson({ countryOfBirth: e.target.value })} className={input} /></Field>
            <Field label="Nationality"><input value={p.nationality} onChange={(e) => setPerson({ nationality: e.target.value })} className={input} /></Field>
            <Field label="Date of death"><input type="date" value={p.dod} onChange={(e) => setPerson({ dod: e.target.value })} className={input} /></Field>
            <Field label="Place of death"><input value={p.placeOfDeath} onChange={(e) => setPerson({ placeOfDeath: e.target.value })} className={input} /></Field>
          </div>
        </>
      )}
      {tab === "other" && (
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
          <Field label="Occupation"><input value={p.occupation} onChange={(e) => setPerson({ occupation: e.target.value })} className={input} /></Field>
          <Field label="Employer"><input value={p.employer} onChange={(e) => setPerson({ employer: e.target.value })} className={input} /></Field>
          <Field label="Education"><input value={p.education} onChange={(e) => setPerson({ education: e.target.value })} placeholder="Highest level, school" className={input} /></Field>
          <Field label="Language"><input value={p.preferredLanguage} onChange={(e) => setPerson({ preferredLanguage: e.target.value })} placeholder="Preferred language" className={input} /></Field>
          <Field label="Driver's license"><input value={p.driversLicense} onChange={(e) => setPerson({ driversLicense: e.target.value })} className={input} /></Field>
          <Field label="SSN (last 4)">
            <input value={p.ssnLast4} onChange={(e) => setPerson({ ssnLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="1234" className={input} />
          </Field>
          <p className="md:col-span-2 text-[12.5px] text-muted">Only the last 4 digits of a Social Security number are kept here, to limit sensitive data on file.</p>
        </div>
      )}
      {tab === "extra" && (
        <div className="grid gap-2">
          {p.extra.map((x, i) => (
            <div key={i} className="grid grid-cols-[200px_1fr_28px] gap-2">
              <input value={x.label} onChange={(e) => setPerson({ extra: p.extra.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} placeholder="Field name" className={input} />
              <input value={x.value} onChange={(e) => setPerson({ extra: p.extra.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} placeholder="Value" className={input} />
              <button type="button" onClick={() => setPerson({ extra: p.extra.filter((_, j) => j !== i) })} className="text-muted hover:text-red-700" aria-label="Remove field"><X size={14} /></button>
            </div>
          ))}
          {!p.extra.length && <p className="text-[13.5px] text-muted mb-1">Add any other details you track for this person.</p>}
          <button type="button" onClick={() => setPerson({ extra: [...p.extra, { label: "", value: "" }] })} className="bg-card-alt hover:bg-line/70 px-3.5 py-1.5 rounded-full text-[13px] font-medium justify-self-start flex items-center gap-1">
            <Plus size={13} /> Add field
          </button>
        </div>
      )}
    </div>
  );
}

function CompanyView({ profile, setP, photo, setPhoto }: { profile: Profile; setP: (fn: (p: Profile) => Profile) => void; photo: string | null; setPhoto: (p: string | null) => void }) {
  const c = profile.company;
  const set = (patch: Partial<Profile["company"]>) => setP((p) => ({ ...p, company: { ...p.company, ...patch } }));
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-5">Company details</div>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Company name"><input value={c.name} onChange={(e) => set({ name: e.target.value })} className={input} /></Field>
        <Field label="Legal name"><input value={c.legalName} onChange={(e) => set({ legalName: e.target.value })} placeholder="If different" className={input} /></Field>
        <Field label="Entity type">
          <select value={c.entityType} onChange={(e) => set({ entityType: e.target.value })} className={`${smallSelect} w-full`}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t || "—"}</option>)}
          </select>
        </Field>
        <Field label="EIN"><input value={c.ein} onChange={(e) => set({ ein: e.target.value })} placeholder="12-3456789" className={input} /></Field>
      </div>
      <Heading>Contact</Heading>
      <div className="grid md:grid-cols-[1fr_150px] gap-8 items-start">
        <ContactLines lines={c.contacts} onChange={(contacts) => set({ contacts })} />
        <PhotoBox photo={photo} setPhoto={setPhoto} />
      </div>
    </div>
  );
}

function DetailsView({ cardType, profile, setP, person, setPerson, auto }: {
  cardType: CardType; profile: Profile; setP: (fn: (p: Profile) => Profile) => void; person: Person; setPerson: (x: Partial<Person>) => void; auto: { title: string; dear: string };
}) {
  const l = profile.letter;
  const setL = (patch: Partial<Profile["letter"]>) => setP((p) => ({ ...p, letter: { ...p.letter, ...patch } }));
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-5">Details</div>
      {cardType === "person" ? (
        <>
          {profile.people.length > 1 && <div className="text-[13px] text-muted mb-2">Contact details for {personFullTitle(person) || "this person"}</div>}
          <ContactLines lines={person.contacts} onChange={(contacts) => setPerson({ contacts })} />
        </>
      ) : (
        <ContactLines lines={profile.company.contacts} onChange={(contacts) => setP((p) => ({ ...p, company: { ...p.company, contacts } }))} />
      )}
      <Heading>Letter</Heading>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13.5px] text-muted">Letter title (address block)</span>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={l.titleAuto} onChange={(e) => setL({ titleAuto: e.target.checked, title: e.target.checked ? l.title : auto.title })} className="accent-black" /> Auto</label>
          </div>
          <textarea value={l.titleAuto ? auto.title : l.title} readOnly={l.titleAuto} onChange={(e) => setL({ title: e.target.value })} rows={3} className={`${input} resize-none ${l.titleAuto ? "bg-card-alt/60" : ""}`} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13.5px] text-muted">Letter &quot;Dear&quot;</span>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={l.dearAuto} onChange={(e) => setL({ dearAuto: e.target.checked, dear: e.target.checked ? l.dear : auto.dear })} className="accent-black" /> Auto</label>
          </div>
          <textarea value={l.dearAuto ? auto.dear : l.dear} readOnly={l.dearAuto} onChange={(e) => setL({ dear: e.target.value })} rows={3} className={`${input} resize-none ${l.dearAuto ? "bg-card-alt/60" : ""}`} />
          {cardType === "person" && (
            <div className="flex justify-end gap-4 mt-2 text-[13px]">
              {(["friendly", "formal"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 capitalize"><input type="radio" checked={l.style === s} onChange={() => setL({ style: s })} className="accent-black" /> {s}</label>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-[12.5px] text-muted mt-3">Used when you draft letters to this client, for example &quot;Dear {l.dearAuto ? auto.dear || "…" : l.dear || "…"},&quot;.</p>
    </div>
  );
}

function AddressFields({ a, set }: { a: Profile["address"]["street"]; set: (patch: Partial<Profile["address"]["street"]>) => void }) {
  return (
    <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
      <Field label="Building name" wide><input value={a.building} onChange={(e) => set({ building: e.target.value })} className={input} /></Field>
      <Field label="Street" wide><input value={a.street} onChange={(e) => set({ street: e.target.value })} placeholder="123 Main St" className={input} /></Field>
      <label className="grid grid-cols-[130px_96px_1fr] items-center gap-2">
        <span className="text-[13.5px] text-muted">Apt / Suite</span>
        <select value={a.aptType} onChange={(e) => set({ aptType: e.target.value })} className={smallSelect} aria-label="Unit type">
          <option value="">—</option>
          {APT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input value={a.aptNo} onChange={(e) => set({ aptNo: e.target.value })} className={input} />
      </label>
      <Field label="Town / City"><input value={a.city} onChange={(e) => set({ city: e.target.value })} className={input} /></Field>
      <Field label="County"><input value={a.county} onChange={(e) => set({ county: e.target.value })} className={input} /></Field>
      <Field label="State"><input value={a.state} onChange={(e) => set({ state: e.target.value })} placeholder="NJ" className={input} /></Field>
      <label className="grid grid-cols-[130px_1fr_70px_1fr] items-center gap-2">
        <span className="text-[13.5px] text-muted">Zip code</span>
        <input value={a.zip} onChange={(e) => set({ zip: e.target.value })} inputMode="numeric" className={input} />
        <span className="text-[13.5px] text-muted text-right">ZIP+4</span>
        <input value={a.zip4} onChange={(e) => set({ zip4: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" className={input} />
      </label>
      <Field label="Country"><input value={a.country} onChange={(e) => set({ country: e.target.value })} className={input} /></Field>
      <Field label="Instructions" wide><input value={a.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="Delivery or access instructions" className={input} /></Field>
    </div>
  );
}

function AddressView({ profile, setP }: { profile: Profile; setP: (fn: (p: Profile) => Profile) => void }) {
  const [tab, setTab] = useState<"street" | "po">("street");
  const [futureOpen, setFutureOpen] = useState(!!profile.address.future.street);
  const b = profile.address.poBox;
  const setBox = (patch: Partial<Profile["address"]["poBox"]>) => setP((p) => ({ ...p, address: { ...p.address, poBox: { ...p.address.poBox, ...patch } } }));
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-3">Address</div>
      <Tabs value={tab} onChange={setTab} items={[["street", "Street"], ["po", "P.O. Box"]]} />
      {tab === "street" ? (
        <>
          <AddressFields a={profile.address.street} set={(patch) => setP((p) => ({ ...p, address: { ...p.address, street: { ...p.address.street, ...patch } } }))} />
          <button type="button" onClick={() => setFutureOpen(!futureOpen)} className="flex items-center gap-2 mt-8 mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted hover:text-ink">
            {futureOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Future address
          </button>
          {futureOpen && (
            <div className="grid gap-3">
              <Field label="Moving on">
                <input type="date" value={profile.address.future.from} onChange={(e) => setP((p) => ({ ...p, address: { ...p.address, future: { ...p.address.future, from: e.target.value } } }))} className={`${input} max-w-[220px]`} />
              </Field>
              <AddressFields a={profile.address.future} set={(patch) => setP((p) => ({ ...p, address: { ...p.address, future: { ...p.address.future, ...patch } } }))} />
            </div>
          )}
        </>
      ) : (
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
          <Field label="P.O. Box"><input value={b.box} onChange={(e) => setBox({ box: e.target.value })} className={input} /></Field>
          <Field label="Town / City"><input value={b.city} onChange={(e) => setBox({ city: e.target.value })} className={input} /></Field>
          <Field label="State"><input value={b.state} onChange={(e) => setBox({ state: e.target.value })} className={input} /></Field>
          <Field label="Zip code"><input value={b.zip} onChange={(e) => setBox({ zip: e.target.value })} className={input} /></Field>
          <Field label="Country"><input value={b.country} onChange={(e) => setBox({ country: e.target.value })} className={input} /></Field>
        </div>
      )}
    </div>
  );
}

function NotesView({ profile, setP }: { profile: Profile; setP: (fn: (p: Profile) => Profile) => void }) {
  const [show, setShow] = useState(false);
  const bank = profile.bank;
  const setBank = (patch: Partial<Profile["bank"]>) => setP((p) => ({ ...p, bank: { ...p.bank, ...patch } }));
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-3">Notes &amp; other</div>
      <textarea value={profile.notes} onChange={(e) => setP((p) => ({ ...p, notes: e.target.value }))} rows={10} placeholder="Enter your notes here…" className={`${input} resize-y`} />
      <Heading>Bank account</Heading>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="grid gap-1"><span className="text-[13px] text-muted">Routing no.</span><input value={bank.routing} onChange={(e) => setBank({ routing: e.target.value.replace(/\D/g, "").slice(0, 9) })} inputMode="numeric" className={input} /></label>
        <label className="grid gap-1">
          <span className="text-[13px] text-muted flex items-center justify-between">Account no.
            <button type="button" onClick={() => setShow(!show)} className="text-muted hover:text-ink" aria-label={show ? "Hide account number" : "Show account number"}>{show ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          </span>
          <input value={bank.account} onChange={(e) => setBank({ account: e.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 34) })} type={show ? "text" : "password"} autoComplete="off" className={input} />
        </label>
        <label className="grid gap-1"><span className="text-[13px] text-muted">Account name</span><input value={bank.name} onChange={(e) => setBank({ name: e.target.value })} className={input} /></label>
      </div>
      <div className="grid md:grid-cols-3 gap-3 mt-3">
        <label className="grid gap-1"><span className="text-[13px] text-muted">Name of bank</span><input value={bank.institution} onChange={(e) => setBank({ institution: e.target.value })} className={input} /></label>
        <label className="grid gap-1"><span className="text-[13px] text-muted">Bank phone</span><input value={bank.phone} onChange={(e) => setBank({ phone: e.target.value })} type="tel" className={input} /></label>
        <label className="grid gap-1"><span className="text-[13px] text-muted">Bank address</span><input value={bank.address} onChange={(e) => setBank({ address: e.target.value })} className={input} /></label>
      </div>
      <p className="text-[12px] text-muted mt-2">Visible to members of your workspace. Only store bank details you need, for example for trust refunds or settlement payments.</p>
      <Heading>Other</Heading>
      <div className="flex gap-6 text-[13.5px]">
        <span className="text-muted">Label as</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={profile.labels.supplier} onChange={(e) => setP((p) => ({ ...p, labels: { ...p.labels, supplier: e.target.checked } }))} className="accent-black" /> Supplier</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={profile.labels.marketingConsent} onChange={(e) => setP((p) => ({ ...p, labels: { ...p.labels, marketingConsent: e.target.checked } }))} className="accent-black" /> Marketing consent</label>
      </div>
    </div>
  );
}

function SaveFirst({ what }: { what: string }) {
  return <div className="py-14 text-center text-[14px] text-muted">Save this card first to see its {what}.</div>;
}

type MatterLite = { id: string; title: string; status: string; category?: string | null; counterparty?: string | null };

function DocumentsView({ clientId, matters }: { clientId: string | null; matters: MatterLite[] }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matterId, setMatterId] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = matters.map((m) => m.id).join(",");
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetch("/api/documents")
      .then(readJson)
      .then((d) => !cancelled && setDocs((d.documents as Doc[]).filter((x) => ids.split(",").includes(x.matterId))))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [clientId, ids]);
  if (!clientId) return <SaveFirst what="documents" />;
  const target = matterId || matters[0]?.id || "";
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const doc = (await uploadAnyDocument(target, file)) as Doc;
      setDocs((d) => [doc, ...(d ?? [])]);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "The upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Documents</div>
        {matters.length > 0 && (
          <div className="flex items-center gap-2">
            {matters.length > 1 && (
              <select value={target} onChange={(e) => setMatterId(e.target.value)} className={smallSelect} aria-label="Matter for the upload">
                {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            )}
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="bg-card-alt hover:bg-line/70 px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import document
            </button>
          </div>
        )}
      </div>
      {error && <div className="mb-3 text-[13px] text-red-700">{error}</div>}
      {matters.length === 0 ? (
        <div className="py-12 text-center text-[14px] text-muted">
          Documents are stored on a matter. <Link href="/dashboard/matters" className="underline underline-offset-2">Create a matter</Link> for this client to add documents.
        </div>
      ) : docs === null ? (
        <div className="py-12 text-center text-[14px] text-muted">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="py-12 text-center text-[14px] text-muted">No documents yet.</div>
      ) : (
        <div className="border border-line rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_130px] gap-3 px-4 py-2 text-[12px] font-medium text-muted border-b border-line bg-card-alt/50">
            <span>Document name</span><span>Matter</span><span>Added</span>
          </div>
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={async () => { const v = d.versions[0]; if (v) window.open(await versionDownloadUrl(v.id), "_blank", "noopener"); }}
              className="w-full grid grid-cols-[1fr_180px_130px] gap-3 px-4 py-2.5 text-left text-[13.5px] border-b border-line last:border-0 hover:bg-card-alt/40"
            >
              <span className="flex items-center gap-2 truncate"><FileText size={15} className="text-muted flex-shrink-0" /> <span className="truncate">{d.title}</span></span>
              <span className="truncate text-muted">{matters.find((m) => m.id === d.matterId)?.title}</span>
              <span className="text-muted">{new Date(d.createdAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MailingsView({ clientId, dirty }: { clientId: string | null; dirty: boolean }) {
  const [data, setData] = useState<{ emails: string[]; messages: { id: string; from: string; subject: string; date: string; snippet: string }[]; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/client-cards/${clientId}/mail`)
      .then(readJson)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [clientId]);
  if (!clientId) return <SaveFirst what="mailings" />;
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-1">Mailings</div>
      <p className="text-[13px] text-muted mb-4">
        Emails with {data?.emails.length ? data.emails.join(", ") : "this client"} from your connected mailbox.{dirty ? " Save to include newly added addresses." : ""}
      </p>
      {error ? (
        <div className="text-[13px] text-red-700">{error}</div>
      ) : !data ? (
        <div className="py-12 text-center text-[14px] text-muted">Searching your mailbox…</div>
      ) : data.messages.length === 0 ? (
        <div className="py-12 text-center text-[14px] text-muted">{data.note ?? "No emails found with this client."}</div>
      ) : (
        <div className="border border-line rounded-xl overflow-hidden">
          {data.messages.map((m) => (
            <Link key={m.id} href="/dashboard/inbox" className="block px-4 py-3 border-b border-line last:border-0 hover:bg-card-alt/40">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] font-medium truncate">{m.subject || "(No subject)"}</span>
                <span className="text-[12px] text-muted whitespace-nowrap">{new Date(m.date).toLocaleDateString()}</span>
              </div>
              <div className="text-[12.5px] text-muted truncate">{m.from} · {m.snippet}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MattersView({ clientId, matters }: { clientId: string | null; matters: MatterLite[] }) {
  const [archived, setArchived] = useState(false);
  if (!clientId) return <SaveFirst what="matters" />;
  const shown = matters.filter((m) => archived || m.status !== "Closed");
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Matters</div>
        <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-black" /> Include closed matters</label>
      </div>
      {shown.length === 0 ? (
        <div className="py-12 text-center text-[14px] text-muted">
          No {archived ? "" : "open "}matters for this client. <Link href="/dashboard/matters" className="underline underline-offset-2">Open Matters</Link> to create one.
        </div>
      ) : (
        <div className="border border-line rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_180px_120px] gap-3 px-4 py-2 text-[12px] font-medium text-muted border-b border-line bg-card-alt/50">
            <span>Matter</span><span>Type</span><span>Other side</span><span>Status</span>
          </div>
          {shown.map((m) => (
            <Link key={m.id} href={`/dashboard/matters/${m.id}`} className="grid grid-cols-[1fr_160px_180px_120px] gap-3 px-4 py-2.5 text-[13.5px] border-b border-line last:border-0 hover:bg-card-alt/40">
              <span className="font-medium truncate">{m.title}</span>
              <span className="text-muted truncate">{m.category && m.category !== "None" ? m.category : "—"}</span>
              <span className="text-muted truncate">{m.counterparty || "—"}</span>
              <span><span className="text-[12px] px-2 py-0.5 rounded-full bg-card-alt border border-line">{m.status}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}


function IntakeView({ profile, setP, cardType }: { profile: Profile; setP: (fn: (p: Profile) => Profile) => void; cardType: CardType }) {
  const it = profile.intake;
  const set = (patch: Partial<Profile["intake"]>) => setP((p) => ({ ...p, intake: { ...p.intake, ...patch } }));
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-5">Intake</div>
      <Heading>Reason for visit</Heading>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Referred by"><input value={it.referredBy} onChange={(e) => set({ referredBy: e.target.value })} placeholder="Person, website, ad…" className={input} /></Field>
        <Field label="Practice area">
          <select value={it.practiceArea} onChange={(e) => set({ practiceArea: e.target.value })} className={`${smallSelect} w-full`}>
            {PRACTICE_AREAS.map((a) => <option key={a} value={a}>{a || "—"}</option>)}
          </select>
        </Field>
      </div>
      <label className="grid gap-1.5 mt-3">
        <span className="text-[13.5px] text-muted">General description of why the client is here</span>
        <textarea value={it.reason} onChange={(e) => set({ reason: e.target.value })} rows={5} className={`${input} resize-y`} />
      </label>
      <Heading>Contact</Heading>
      <div className="grid gap-3">
        <Field label="Preference">
          <div className="flex flex-wrap items-center gap-4 text-[13.5px]">
            {CONTACT_PREFERENCES.filter(Boolean).map((c) => (
              <label key={c} className="flex items-center gap-1.5"><input type="radio" checked={it.contactPreference === c} onChange={() => set({ contactPreference: c })} className="accent-black" /> {c}</label>
            ))}
            {it.contactPreference === "Other" && <input value={it.contactPreferenceOther} onChange={(e) => set({ contactPreferenceOther: e.target.value })} placeholder="e.g. WhatsApp" className={`${input} max-w-[200px]`} />}
          </div>
        </Field>
        <Field label="Mailing address"><input value={it.mailingAddress} onChange={(e) => set({ mailingAddress: e.target.value })} placeholder="If different from the street address" className={input} /></Field>
      </div>
      {cardType === "person" && (
        <>
          <Heading>Family</Heading>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
            <Field label="Date of marriage"><input type="date" value={it.marriageDate} onChange={(e) => set({ marriageDate: e.target.value })} className={input} /></Field>
            <Field label="Children">
              <div className="flex gap-4 text-[13.5px]">
                {(["Yes", "No"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-1.5"><input type="radio" checked={it.children === c} onChange={() => set({ children: c })} className="accent-black" /> {c}</label>
                ))}
              </div>
            </Field>
            {it.children === "Yes" && (
              <Field label="Names / ages" wide><input value={it.childrenDetails} onChange={(e) => set({ childrenDetails: e.target.value })} placeholder="Anna (12), Tom (9)" className={input} /></Field>
            )}
          </div>
          <p className="text-[12.5px] text-muted mt-3">
            Spouse details come from the second person on this card: add them with <span className="font-medium">+</span> next to People. Marital status, employment and education are on each person&apos;s card.
          </p>
        </>
      )}
    </div>
  );
}

function EngagementModal({ cardType, profile, dear, matters, onClose, onCreate }: {
  cardType: CardType; profile: Profile; dear: string; matters: MatterLite[];
  onClose: () => void; onCreate: (opts: Record<string, string>, matterId: string | null) => Promise<void>;
}) {
  const a = profile.address.street;
  const property = [a.street, a.aptNo ? `${a.aptType || "Apt."} ${a.aptNo}` : "", a.city, [a.state, a.zip].filter(Boolean).join(" ")].map((x) => x.trim()).filter(Boolean).join(", ");
  const names = cardType === "company" ? profile.company.name : personName(profile.people[0]); // "Your Ref" is the lead client
  const [matterId, setMatterId] = useState(matters[0]?.id ?? "");
  const [kind, setKind] = useState("purchase - residential");
  const [prop, setProp] = useState(property);
  const [ourRef, setOurRef] = useState(`PR:REP-${new Date().getFullYear()}-`);
  const [yourRef, setYourRef] = useState(names);
  const [dearLine, setDearLine] = useState(dear);
  const [date, setDate] = useState(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6" onClick={() => !busy && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[600px] max-h-full overflow-y-auto p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[20px] font-semibold">Engagement agreement</h2>
          <button onClick={onClose} disabled={busy} className="text-muted hover:text-ink" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-[13.5px] text-muted mb-5">Real estate purchase letter, filled in from this client card. You get a Word file to review, and it&apos;s saved to the matter&apos;s Documents.</p>
        <div className="grid gap-3">
          <Field label="Matter">
            <select value={matterId} onChange={(e) => setMatterId(e.target.value)} className={`${smallSelect} w-full`}>
              {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              <option value="">Don&apos;t save to a matter (download only)</option>
            </select>
          </Field>
          <Field label="Transaction">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${smallSelect} w-full`}>
              {["purchase - residential", "purchase - commercial", "purchase - new construction", "purchase - multi-family"].map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Property"><input value={prop} onChange={(e) => setProp(e.target.value)} placeholder="317 Alpine Street, Lacey, NJ 08731" className={input} /></Field>
          <Field label="Our ref"><input value={ourRef} onChange={(e) => setOurRef(e.target.value)} className={input} /></Field>
          <Field label="Your ref"><input value={yourRef} onChange={(e) => setYourRef(e.target.value)} className={input} /></Field>
          <Field label="Dear"><input value={dearLine} onChange={(e) => setDearLine(e.target.value)} className={input} /></Field>
          <Field label="Date"><input value={date} onChange={(e) => setDate(e.target.value)} className={input} /></Field>
        </div>
        <p className="text-[12.5px] text-muted mt-3">The letter reads: &quot;Representing {cardType === "company" ? profile.company.name : profile.people.map(personName).filter(Boolean).join(" and ") || "…"} with the {kind} of {prop || "…"}.&quot;</p>
        {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{err}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={busy} className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium disabled:opacity-50">Cancel</button>
          <button
            disabled={busy || !prop.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onCreate({ description: `${kind} of ${prop.trim()}`, ourRef, yourRef, dear: dearLine, date }, matterId || null);
              } catch (e) {
                setErr(e instanceof UploadError ? e.message : (e as Error).message);
                setBusy(false);
              }
            }}
            className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Create agreement
          </button>
        </div>
      </div>
    </div>
  );
}
