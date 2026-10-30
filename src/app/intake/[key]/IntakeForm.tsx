"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { MATTER_TYPES, CONTACT_WAYS, type LeadForm } from "@/lib/leads";
import BookingPicker from "./BookingPicker";

const EMPTY: LeadForm = {
  title: "", firstName: "", lastName: "", company: "", email: "", phone: "", street: "", city: "", state: "NJ", zip: "",
  matterType: "", description: "", otherParties: "", preferredContact: "", bestTime: "", referredBy: "",
};

const field = "w-full bg-white border border-[#D1D7E0] rounded-xl px-3.5 py-2.5 text-[15px] outline-none focus:border-[#5E6E8C] focus:ring-2 focus:ring-[#5E6E8C]/15";
const label = "block text-[13.5px] font-medium text-[#3B3F47] mb-1.5";

export default function IntakeForm({ firmKey, firmName, logoUrl, invite, prefill, embed }: { firmKey: string; firmName: string; logoUrl: string | null; invite: string | null; prefill: Partial<LeadForm>; embed: boolean }) {
  const [f, setF] = useState<LeadForm>({ ...EMPTY, ...Object.fromEntries(Object.entries(prefill).filter(([, v]) => v)) });
  const [startedAt] = useState(() => Date.now());
  const [honey, setHoney] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [booking, setBooking] = useState<string | null>(null); // online booking token, when the firm offers it
  const set = (p: Partial<LeadForm>) => setF((x) => ({ ...x, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.firstName.trim() && !f.lastName.trim()) return setError("Please enter your name.");
    if (!f.email.trim() && !f.phone.trim()) return setError("Please enter an email address or a phone number so we can reach you.");
    setBusy(true);
    try {
      const r = await fetch(`/api/public/intake/${firmKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, invite, website: honey, startedAt }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; booking?: string | null };
      if (!r.ok) throw new Error(d.error ?? "Your form couldn't be sent. Please try again.");
      setBooking(d.booking ?? null);
      setDone(true);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shell = embed ? "px-4 py-6" : "min-h-screen bg-[#F3F5F9] px-4 py-10";
  return (
    <div className={shell} style={{ fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif", color: "#1B191A" }}>
      <div className={`max-w-[680px] mx-auto ${embed ? "" : "bg-white rounded-3xl shadow-[0_20px_60px_-30px_rgba(18,17,16,0.25)] px-6 sm:px-10 py-9"}`}>
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="h-11 w-auto" />}
          <div>
            <div className="text-[13px] font-medium text-[#6B7280]">{firmName}</div>
            <h1 className="text-[24px] font-semibold leading-tight">{done ? "Thank you" : "New client intake"}</h1>
          </div>
        </div>

        {done ? (
          <div className="py-6">
            <div className="flex items-start gap-3 rounded-2xl bg-[#EFF8F2] px-5 py-4 mb-7">
              <CheckCircle2 size={22} className="text-[#00A35F] flex-shrink-0 mt-0.5" />
              <div className="text-[15px] leading-relaxed">
                {booking
                  ? "We've received your information. Pick a time below for your consultation."
                  : `We've received your information. Someone from our office will contact you soon${f.preferredContact ? ` by ${f.preferredContact.toLowerCase()}` : ""}.`}
              </div>
            </div>
            {booking && <BookingPicker firmKey={firmKey} token={booking} firmName={firmName} />}
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="text-[14.5px] text-[#5B616B] mb-7 leading-relaxed">Tell us a little about yourself and how we can help. It takes about five minutes.</p>

            <fieldset className="mb-7">
              <legend className="text-[16px] font-semibold mb-3">About you</legend>
              <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr] gap-3">
                <div>
                  <label className={label} htmlFor="title">Title</label>
                  <select id="title" value={f.title} onChange={(e) => set({ title: e.target.value })} className={field}>
                    {["", "Mr.", "Mrs.", "Ms.", "Miss", "Dr."].map((t) => (
                      <option key={t} value={t}>{t || "—"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="first">First name *</label>
                  <input id="first" autoComplete="given-name" value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} className={field} maxLength={80} />
                </div>
                <div>
                  <label className={label} htmlFor="last">Last name *</label>
                  <input id="last" autoComplete="family-name" value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} className={field} maxLength={80} />
                </div>
              </div>
              <div className="mt-3">
                <label className={label} htmlFor="company">Company or organization (if this is for a business)</label>
                <input id="company" autoComplete="organization" value={f.company} onChange={(e) => set({ company: e.target.value })} className={field} maxLength={160} />
              </div>
            </fieldset>

            <fieldset className="mb-7">
              <legend className="text-[16px] font-semibold mb-3">How to reach you</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="email">Email</label>
                  <input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => set({ email: e.target.value })} className={field} maxLength={200} />
                </div>
                <div>
                  <label className={label} htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} className={field} maxLength={40} />
                </div>
                <div>
                  <label className={label} htmlFor="contact">Best way to contact you</label>
                  <select id="contact" value={f.preferredContact} onChange={(e) => set({ preferredContact: e.target.value })} className={field}>
                    <option value="">No preference</option>
                    {CONTACT_WAYS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="time">Best time</label>
                  <input id="time" value={f.bestTime} onChange={(e) => set({ bestTime: e.target.value })} placeholder="e.g. weekdays after 5 pm" className={field} maxLength={120} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px_110px] gap-3 mt-3">
                <div>
                  <label className={label} htmlFor="street">Street address</label>
                  <input id="street" autoComplete="street-address" value={f.street} onChange={(e) => set({ street: e.target.value })} className={field} maxLength={200} />
                </div>
                <div>
                  <label className={label} htmlFor="city">City</label>
                  <input id="city" autoComplete="address-level2" value={f.city} onChange={(e) => set({ city: e.target.value })} className={field} maxLength={100} />
                </div>
                <div>
                  <label className={label} htmlFor="state">State</label>
                  <input id="state" autoComplete="address-level1" value={f.state} onChange={(e) => set({ state: e.target.value })} className={field} maxLength={40} />
                </div>
                <div>
                  <label className={label} htmlFor="zip">ZIP</label>
                  <input id="zip" autoComplete="postal-code" value={f.zip} onChange={(e) => set({ zip: e.target.value })} className={field} maxLength={20} />
                </div>
              </div>
            </fieldset>

            <fieldset className="mb-7">
              <legend className="text-[16px] font-semibold mb-3">How can we help?</legend>
              <label className={label} htmlFor="type">What do you need help with?</label>
              <select id="type" value={f.matterType} onChange={(e) => set({ matterType: e.target.value })} className={`${field} mb-3`}>
                <option value="">Choose one</option>
                {MATTER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <label className={label} htmlFor="desc">Tell us briefly about your situation</label>
              <textarea id="desc" rows={5} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. We're buying a house in Toms River and signed the contract yesterday." className={`${field} resize-y mb-3`} maxLength={5000} />
              <label className={label} htmlFor="parties">Names of anyone else involved (the other side, sellers or buyers, family members)</label>
              <input id="parties" value={f.otherParties} onChange={(e) => set({ otherParties: e.target.value })} placeholder="We ask so we can check for conflicts of interest" className={field} maxLength={1000} />
            </fieldset>

            <fieldset className="mb-6">
              <label className={label} htmlFor="ref">How did you hear about us?</label>
              <input id="ref" value={f.referredBy} onChange={(e) => set({ referredBy: e.target.value })} className={field} maxLength={200} />
            </fieldset>

            {/* Hidden from people; bots fill it in. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor="website">Website</label>
              <input id="website" tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} />
            </div>

            <p className="text-[12.5px] text-[#6B7280] leading-relaxed mb-5 flex gap-2">
              <Lock size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Your information goes only to {firmName} and is kept confidential. Sending this form does not make us your attorneys; an attorney-client relationship begins only once we agree in writing to represent you. Please don&apos;t send time-sensitive or highly confidential details until we&apos;ve spoken.
              </span>
            </p>

            {error && <div className="mb-4 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[14px]">{error}</div>}

            <button type="submit" disabled={busy} className="w-full sm:w-auto bg-[#1B191A] text-white px-7 py-3 rounded-full text-[15px] font-semibold hover:bg-black disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} Send to {firmName}
            </button>
          </form>
        )}
        {!embed && <div className="mt-8 text-center text-[11.5px] text-[#9AA1AC]">Secure form by LawPower</div>}
      </div>
    </div>
  );
}
