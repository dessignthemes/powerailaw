"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, Plus, UserRound, MapPin, ClipboardList, Building2 } from "lucide-react";
import PortalHeader from "../PortalHeader";
import { TITLES, RELATIONSHIP, CONTACT_PREFERENCES, APT_TYPES, ENTITY_TYPES, genderForTitle, type PortalIntake, type PortalPerson } from "@/lib/clients/card";

// The client completes or corrects their intake sheet; saving updates the firm's client card.

const blankPerson = (): PortalPerson => ({
  id: Math.random().toString(36).slice(2, 10),
  title: "", first: "", middle: "", last: "", suffix: "", previousNames: "", gender: "", relationship: "",
  dob: "", placeOfBirth: "", countryOfBirth: "", nationality: "", occupation: "", employer: "", preferredLanguage: "",
  email: "", phone: "", cell: "",
});

const input = "w-full bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none focus:border-[#AEB8C6]";

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof UserRound; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card-alt rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-muted" />
        <h2 className="text-[16px] font-semibold">{title}</h2>
      </div>
      {hint && <p className="text-[13px] text-muted mb-4">{hint}</p>}
      <div className={hint ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

export default function PortalIntakePage() {
  const router = useRouter();
  const [firm, setFirm] = useState<string | undefined>();
  const [form, setForm] = useState<PortalIntake | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/portal/intake")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.status === 401) return void router.replace("/portal/login");
        if (!r.ok) return setError(d?.error ?? "Your intake sheet couldn't be loaded.");
        setFirm(d.firm);
        setForm(d.intake);
        setLastSavedAt(d.lastSavedAt);
      })
      .catch(() => live && setError("Your intake sheet couldn't be loaded. Check your connection."));
    return () => {
      live = false;
    };
  }, [router]);

  const setPerson = (i: number, patch: Partial<PortalPerson>) =>
    setForm((f) => (f ? { ...f, people: f.people.map((p, j) => (j === i ? { ...p, ...patch } : p)) } : f));
  const set = <K extends keyof PortalIntake>(key: K, patch: Partial<PortalIntake[K]>) =>
    setForm((f) => (f ? { ...f, [key]: { ...(f[key] as object), ...patch } } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fetch("/api/portal/intake", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) return void router.replace("/portal/login");
      if (!r.ok) throw new Error(d?.error ?? "Your intake sheet couldn't be saved. Please try again.");
      setForm(d.intake);
      setLastSavedAt(d.lastSavedAt);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PortalHeader firm={firm} />
      <main className="flex-1 max-w-[860px] w-full mx-auto px-5 py-8">
        <Link href="/portal" className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink mb-4">
          <ArrowLeft size={14} /> Back to your portal
        </Link>
        <h1 className="text-[26px] font-semibold">Your intake sheet</h1>
        <p className="text-[14px] text-muted mt-1 mb-6">
          Please check your details, fill in anything that&apos;s missing and click <b className="text-ink">Save</b>. {firm ?? "Your law firm"} sees your
          changes right away.
          {lastSavedAt && ` Last saved ${new Date(lastSavedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}.`}
        </p>

        {saved && (
          <div className="mb-5 rounded-xl bg-[#E8F6EE] px-4 py-3 text-[14px] flex items-center gap-2">
            <Check size={16} className="text-[#2F9E5A]" /> Saved. Thank you, {firm ?? "your law firm"} now has your up-to-date details.
          </div>
        )}
        {error && <div className="mb-5 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[14px]">{error}</div>}

        {!form ? (
          !error && (
            <div className="flex items-center justify-center gap-2 text-muted text-[14px] py-20">
              <Loader2 size={16} className="animate-spin" /> Loading your intake sheet…
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            {form.cardType === "company" && (
              <Section icon={Building2} title="Company">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Company name">
                    <input className={input} value={form.company.name} onChange={(e) => set("company", { name: e.target.value })} />
                  </Field>
                  <Field label="Legal name">
                    <input className={input} value={form.company.legalName} onChange={(e) => set("company", { legalName: e.target.value })} />
                  </Field>
                  <Field label="Type of entity">
                    <select className={input} value={form.company.entityType} onChange={(e) => set("company", { entityType: e.target.value })}>
                      {ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t || "Choose…"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Website">
                    <input className={input} value={form.company.website} onChange={(e) => set("company", { website: e.target.value })} placeholder="https://" />
                  </Field>
                  <Field label="Email">
                    <input className={input} type="email" value={form.company.email} onChange={(e) => set("company", { email: e.target.value })} />
                  </Field>
                  <Field label="Phone">
                    <input className={input} type="tel" value={form.company.phone} onChange={(e) => set("company", { phone: e.target.value })} />
                  </Field>
                </div>
              </Section>
            )}

            {form.people.map((p, i) => (
              <Section
                key={p.id}
                icon={UserRound}
                title={form.cardType === "company" ? `Contact person${form.people.length > 1 ? ` ${i + 1}` : ""}` : i === 0 ? "Your details" : `Person ${i + 1}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid grid-cols-[96px_1fr] gap-2 sm:col-span-2">
                    <Field label="Title">
                      <select
                        className={input}
                        value={p.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          const followsTitle = !p.gender || p.gender === genderForTitle(p.title);
                          setPerson(i, followsTitle ? { title, gender: genderForTitle(title) } : { title });
                        }}
                      >
                        {TITLES.map((t) => (
                          <option key={t} value={t}>
                            {t || "—"}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="First name">
                      <input className={input} value={p.first} onChange={(e) => setPerson(i, { first: e.target.value })} autoComplete="given-name" />
                    </Field>
                  </div>
                  <Field label="Middle name">
                    <input className={input} value={p.middle} onChange={(e) => setPerson(i, { middle: e.target.value })} autoComplete="additional-name" />
                  </Field>
                  <Field label="Last name">
                    <input className={input} value={p.last} onChange={(e) => setPerson(i, { last: e.target.value })} autoComplete="family-name" />
                  </Field>
                  <Field label="Suffix">
                    <input className={input} value={p.suffix} onChange={(e) => setPerson(i, { suffix: e.target.value })} placeholder="Jr., Sr., III" />
                  </Field>
                  <Field label="Previous names">
                    <input className={input} value={p.previousNames} onChange={(e) => setPerson(i, { previousNames: e.target.value })} placeholder="e.g. maiden name" />
                  </Field>
                  <Field label="Email">
                    <input className={input} type="email" value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} autoComplete="email" />
                  </Field>
                  <Field label="Cell phone">
                    <input className={input} type="tel" value={p.cell} onChange={(e) => setPerson(i, { cell: e.target.value })} autoComplete="tel" />
                  </Field>
                  <Field label="Home / other phone">
                    <input className={input} type="tel" value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} />
                  </Field>
                  <Field label="Date of birth">
                    <input className={input} type="date" value={p.dob} onChange={(e) => setPerson(i, { dob: e.target.value })} autoComplete="bday" />
                  </Field>
                  <Field label="Gender">
                    <select className={input} value={p.gender} onChange={(e) => setPerson(i, { gender: e.target.value as PortalPerson["gender"] })}>
                      <option value="">—</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </Field>
                  <Field label="Marital status">
                    <select className={input} value={p.relationship} onChange={(e) => setPerson(i, { relationship: e.target.value })}>
                      {RELATIONSHIP.map((r) => (
                        <option key={r} value={r}>
                          {r || "—"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Place of birth">
                    <input className={input} value={p.placeOfBirth} onChange={(e) => setPerson(i, { placeOfBirth: e.target.value })} />
                  </Field>
                  <Field label="Country of birth">
                    <input className={input} value={p.countryOfBirth} onChange={(e) => setPerson(i, { countryOfBirth: e.target.value })} />
                  </Field>
                  <Field label="Nationality">
                    <input className={input} value={p.nationality} onChange={(e) => setPerson(i, { nationality: e.target.value })} />
                  </Field>
                  <Field label="Preferred language">
                    <input className={input} value={p.preferredLanguage} onChange={(e) => setPerson(i, { preferredLanguage: e.target.value })} />
                  </Field>
                  <Field label="Occupation">
                    <input className={input} value={p.occupation} onChange={(e) => setPerson(i, { occupation: e.target.value })} />
                  </Field>
                  <Field label="Employer">
                    <input className={input} value={p.employer} onChange={(e) => setPerson(i, { employer: e.target.value })} />
                  </Field>
                </div>
              </Section>
            ))}
            {form.people.length < 6 && (
              <button
                onClick={() => setForm((f) => (f ? { ...f, people: [...f.people, blankPerson()] } : f))}
                className="self-start flex items-center gap-1.5 bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium"
              >
                <Plus size={14} /> Add a person (e.g. spouse or co-client)
              </button>
            )}

            <Section icon={MapPin} title="Address">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Street address" wide>
                  <input className={input} value={form.address.street} onChange={(e) => set("address", { street: e.target.value })} autoComplete="street-address" />
                </Field>
                <div className="grid grid-cols-[110px_1fr] gap-2">
                  <Field label="Unit type">
                    <select className={input} value={form.address.aptType} onChange={(e) => set("address", { aptType: e.target.value })}>
                      <option value="">—</option>
                      {APT_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Number">
                    <input className={input} value={form.address.aptNo} onChange={(e) => set("address", { aptNo: e.target.value })} />
                  </Field>
                </div>
                <Field label="City">
                  <input className={input} value={form.address.city} onChange={(e) => set("address", { city: e.target.value })} autoComplete="address-level2" />
                </Field>
                <Field label="County">
                  <input className={input} value={form.address.county} onChange={(e) => set("address", { county: e.target.value })} />
                </Field>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Field label="State">
                    <input className={input} value={form.address.state} onChange={(e) => set("address", { state: e.target.value })} autoComplete="address-level1" />
                  </Field>
                  <Field label="ZIP">
                    <input className={input} value={form.address.zip} onChange={(e) => set("address", { zip: e.target.value })} autoComplete="postal-code" />
                  </Field>
                </div>
                <Field label="Country">
                  <input className={input} value={form.address.country} onChange={(e) => set("address", { country: e.target.value })} autoComplete="country-name" />
                </Field>
                <Field label="Mailing address (if different)" wide>
                  <input className={input} value={form.intake.mailingAddress} onChange={(e) => set("intake", { mailingAddress: e.target.value })} />
                </Field>
                <Field label="P.O. Box">
                  <input className={input} value={form.poBox.box} onChange={(e) => set("poBox", { box: e.target.value })} />
                </Field>
              </div>
            </Section>

            <Section icon={ClipboardList} title="About your matter" hint="This helps your attorney prepare.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="What can we help you with?" wide>
                  <textarea className={`${input} resize-y`} rows={4} value={form.intake.reason} onChange={(e) => set("intake", { reason: e.target.value })} />
                </Field>
                <Field label="How did you hear about us?">
                  <input className={input} value={form.intake.referredBy} onChange={(e) => set("intake", { referredBy: e.target.value })} />
                </Field>
                <Field label="Best way to reach you">
                  <select
                    className={input}
                    value={form.intake.contactPreference}
                    onChange={(e) => set("intake", { contactPreference: e.target.value as PortalIntake["intake"]["contactPreference"] })}
                  >
                    {CONTACT_PREFERENCES.map((c) => (
                      <option key={c} value={c}>
                        {c || "—"}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.intake.contactPreference === "Other" && (
                  <Field label="Other way to reach you" wide>
                    <input className={input} value={form.intake.contactPreferenceOther} onChange={(e) => set("intake", { contactPreferenceOther: e.target.value })} />
                  </Field>
                )}
                {form.cardType === "person" && (
                  <>
                    <Field label="Date of marriage (if married)">
                      <input className={input} type="date" value={form.intake.marriageDate} onChange={(e) => set("intake", { marriageDate: e.target.value })} />
                    </Field>
                    <Field label="Do you have children?">
                      <select
                        className={input}
                        value={form.intake.children}
                        onChange={(e) => set("intake", { children: e.target.value as PortalIntake["intake"]["children"] })}
                      >
                        <option value="">—</option>
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </Field>
                    {form.intake.children === "Yes" && (
                      <Field label="Children (names and ages)" wide>
                        <textarea className={`${input} resize-y`} rows={3} value={form.intake.childrenDetails} onChange={(e) => set("intake", { childrenDetails: e.target.value })} />
                      </Field>
                    )}
                  </>
                )}
              </div>
            </Section>

            <div className="sticky bottom-0 -mx-5 px-5 py-4 bg-page/95 backdrop-blur border-t border-line flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] text-muted flex-1 min-w-[200px]">Only you and {firm ?? "your law firm"} can see this information.</span>
              <Link href="/portal" className="px-4 py-2.5 rounded-full text-[14px] font-medium hover:bg-chip">
                Back
              </Link>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-6 py-2.5 rounded-full text-[14px] font-medium"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
