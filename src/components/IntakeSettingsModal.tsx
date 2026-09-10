"use client";

import { useState } from "react";
import { X, Check, Plus, Copy, FlaskConical, MessageSquare, List } from "lucide-react";

const availableLanguages = ["Spanish", "French", "Portuguese", "Mandarin", "Arabic"];

type Question = { id: string; text: string };

export default function IntakeSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"setup" | "performance">("setup");

  const [languages, setLanguages] = useState<string[]>([]);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const [firstView, setFirstView] = useState<"conversation" | "form">("conversation");
  const [openingMessage, setOpeningMessage] = useState("Hi — what brings you in today?");
  const [aboutFirm, setAboutFirm] = useState(
    "Areas we take on, how consultations work, how quickly we reply, and anything the assistant must not promise."
  );

  const [firmName, setFirmName] = useState("");
  const [headline, setHeadline] = useState("");
  const [disclaimer, setDisclaimer] = useState(
    "This intake provides general information only—not legal advice. Sending information does not create an attorney-client relationship."
  );
  const [consentNotice, setConsentNotice] = useState(
    "You're chatting with an AI assistant, not a lawyer. By continuing you agree that the details you share — including personal data — are processed and stored so the firm can review your enquiry."
  );

  const [questions, setQuestions] = useState<Question[]>([]);

  const [fitCriteria, setFitCriteria] = useState("");
  const [closingMessage, setClosingMessage] = useState("");

  const [appearanceTab, setAppearanceTab] = useState<"light" | "dark" | "auto">("light");
  const [lightBg, setLightBg] = useState("#FAF6EF");
  const [lightAccent, setLightAccent] = useState("#121110");
  const [darkBg, setDarkBg] = useState("#1B1A18");
  const [darkAccent, setDarkAccent] = useState("#F4EFE6");
  const [showPoweredBy, setShowPoweredBy] = useState(true);

  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const directLink = "https://app.powerailaw.com/i/yourfirm";
  const embedSnippet = `<div data-powerailaw-slug="yourfirm"></div>\n<script src="https://app.powerailaw.com/embed.js" async></script>`;

  const missing: string[] = [];
  if (!fitCriteria.trim()) missing.push("Fit criteria is required before activation");
  if (!closingMessage.trim()) missing.push("A closing message is required before activation");

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="bg-cream rounded-3xl w-full max-w-[1080px] max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between px-9 pt-8">
          <div>
            <h2 className="text-[26px] font-semibold mb-1.5">Intake</h2>
            <p className="text-[14px] text-muted">
              Your public intake form, its languages and appearance, with the live widget beside it.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink mt-1">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-9 pt-5">
          <div className="inline-flex bg-card-alt rounded-full p-1">
            <button
              onClick={() => setTab("setup")}
              className={`px-4 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
                tab === "setup" ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              Form setup
            </button>
            <button
              onClick={() => setTab("performance")}
              className={`px-4 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
                tab === "performance" ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              Performance
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-9 py-7">
          {tab === "performance" ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-[15px] font-medium text-muted">
                Performance metrics will appear here once your intake form is live.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10">
              <div className="flex flex-col gap-9">
                {/* Languages */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1.5">Languages</h3>
                  <p className="text-[13.5px] text-muted mb-4 leading-relaxed">
                    Write the form in your main language first, then switch to add a translation.
                    Anything you leave blank falls back to English.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="bg-card-alt border border-line rounded-full px-3.5 py-1.5 text-[13.5px] font-medium flex items-center gap-1.5">
                      English <span className="text-muted font-normal">Main</span>
                    </div>
                    {languages.map((l) => (
                      <div
                        key={l}
                        className="bg-white border border-line rounded-full px-3.5 py-1.5 text-[13.5px] font-medium flex items-center gap-1.5"
                      >
                        {l}
                        <button
                          onClick={() => setLanguages((ls) => ls.filter((x) => x !== l))}
                          className="text-muted hover:text-ink"
                        >
                          <X size={12} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                    <div className="relative">
                      <button
                        onClick={() => setLangMenuOpen((o) => !o)}
                        className="flex items-center gap-1.5 border border-line rounded-full px-3.5 py-1.5 text-[13.5px] font-medium hover:bg-card-alt transition-colors"
                      >
                        <Plus size={13} strokeWidth={2} /> Add language
                      </button>
                      {langMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                          <div className="absolute left-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[180px]">
                            {availableLanguages
                              .filter((l) => !languages.includes(l))
                              .map((l) => (
                                <button
                                  key={l}
                                  onClick={() => {
                                    setLanguages((ls) => [...ls, l]);
                                    setLangMenuOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl text-[14px] hover:bg-card-alt transition-colors"
                                >
                                  {l}
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                <div className="border-t border-line" />

                {/* What visitors see first */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1.5">What visitors see first</h3>
                  <p className="text-[13.5px] text-muted mb-4 leading-relaxed">
                    Pick this first: it decides what the rest of this page is for.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={() => setFirstView("conversation")}
                      className={`text-left border rounded-2xl p-4 transition-colors ${
                        firstView === "conversation" ? "border-ink bg-card-alt" : "border-line"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-2 font-semibold text-[14.5px]">
                          <MessageSquare size={15} strokeWidth={1.75} /> Conversation
                        </span>
                        {firstView === "conversation" && <Check size={15} strokeWidth={2} />}
                      </div>
                      <p className="text-[13px] text-muted leading-relaxed">
                        A conversation that asks one thing at a time and adapts to the answers.
                      </p>
                    </button>
                    <button
                      onClick={() => setFirstView("form")}
                      className={`text-left border rounded-2xl p-4 transition-colors ${
                        firstView === "form" ? "border-ink bg-card-alt" : "border-line"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-2 font-semibold text-[14.5px]">
                          <List size={15} strokeWidth={1.75} /> Form
                        </span>
                        {firstView === "form" && <Check size={15} strokeWidth={2} />}
                      </div>
                      <p className="text-[13px] text-muted leading-relaxed">
                        Every question on one page, filled in and sent in a single pass.
                      </p>
                    </button>
                  </div>
                  <p className="text-[13px] text-muted mb-5">
                    Either way they can switch: the conversation offers the form, and the form offers
                    the conversation back.
                  </p>

                  <label className="text-[14.5px] font-semibold block mb-2">Opening message</label>
                  <textarea
                    value={openingMessage}
                    onChange={(e) => setOpeningMessage(e.target.value)}
                    rows={2}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none mb-2"
                  />
                  <p className="text-[12.5px] text-muted leading-relaxed">
                    The assistant&rsquo;s first line in the conversation, which visitors reach from the
                    form too. Leave blank to use the standard opener, which is already translated into
                    every language.
                  </p>
                </section>

                <div className="border-t border-line" />

                <section>
                  <label className="text-[14.5px] font-semibold block mb-2">
                    What the assistant may say about your firm
                  </label>
                  <textarea
                    value={aboutFirm}
                    onChange={(e) => setAboutFirm(e.target.value)}
                    rows={3}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none mb-2"
                  />
                  <p className="text-[12.5px] text-muted leading-relaxed">
                    Facts the assistant answers a prospect&rsquo;s questions from in the conversation,
                    which visitors reach from the form too. Leave out fees and prices: the assistant is
                    not allowed to quote or discuss them. Never shown on the page, and never
                    translated — write it in your own language and the assistant replies in the
                    visitor&rsquo;s.
                  </p>
                </section>

                <div className="border-t border-line" />

                {/* Introduction */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1">Introduction</h3>
                  <p className="text-[13.5px] text-muted mb-5">What prospects read before they start.</p>

                  <label className="text-[14.5px] font-semibold block mb-2">Firm name</label>
                  <input
                    value={firmName}
                    onChange={(e) => setFirmName(e.target.value)}
                    placeholder="PowerAI Law"
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none mb-2 placeholder:text-muted"
                  />
                  <p className="text-[12.5px] text-muted mb-5">
                    Shown at the top of your intake form. Leave blank to use PowerAI Law.
                  </p>

                  <label className="text-[14.5px] font-semibold block mb-2">Headline</label>
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="How can we help?"
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none mb-2 placeholder:text-muted"
                  />
                  <p className="text-[12.5px] text-muted mb-5">
                    Sits under your firm name on the intake page. Leave blank to use &ldquo;How can we
                    help?&rdquo;.
                  </p>

                  <label className="text-[14.5px] font-semibold block mb-2">Disclaimer</label>
                  <textarea
                    value={disclaimer}
                    onChange={(e) => setDisclaimer(e.target.value)}
                    rows={2}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none mb-2"
                  />
                  <p className="text-[12.5px] text-muted mb-5">
                    Shown to every visitor before they start. Leave blank to use the standard wording.
                  </p>

                  <label className="text-[14.5px] font-semibold block mb-2">Consent notice</label>
                  <textarea
                    value={consentNotice}
                    onChange={(e) => setConsentNotice(e.target.value)}
                    rows={2}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none mb-2"
                  />
                  <p className="text-[12.5px] text-muted">
                    Sits under the message box for the whole conversation. Leave blank to use the
                    standard wording, which is already translated into every language.
                  </p>
                </section>

                <div className="border-t border-line" />

                {/* Questions */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1">Questions</h3>
                  <p className="text-[13.5px] text-muted mb-4">
                    Contact details are collected for you. Add what you need to know about the matter
                    itself.
                  </p>

                  <div className="border border-line rounded-2xl px-4 py-3.5 flex items-center justify-between mb-3 bg-card-alt">
                    <div>
                      <div className="text-[14px] font-semibold">🔒 Contact details</div>
                      <div className="text-[12.5px] text-muted mt-0.5">
                        Full name · Email address · Phone number · Company
                      </div>
                    </div>
                    <span className="text-[12px] text-muted">Always asked first</span>
                  </div>

                  {questions.length === 0 ? (
                    <div className="border border-dashed border-line rounded-2xl px-4 py-6 text-center text-[13.5px] text-muted mb-3">
                      No questions of your own yet. Prospects will only be asked for contact details.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 mb-3">
                      {questions.map((q) => (
                        <div
                          key={q.id}
                          className="flex items-center gap-2 border border-line rounded-xl px-3.5 py-2.5 bg-white"
                        >
                          <input
                            value={q.text}
                            onChange={(e) =>
                              setQuestions((qs) =>
                                qs.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x))
                              )
                            }
                            placeholder="e.g. What type of matter is this?"
                            className="flex-1 outline-none text-[14px] placeholder:text-muted bg-transparent"
                          />
                          <button
                            onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                            className="text-muted hover:text-ink"
                          >
                            <X size={15} strokeWidth={1.75} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() =>
                      setQuestions((qs) => [...qs, { id: crypto.randomUUID(), text: "" }])
                    }
                    className="flex items-center gap-1.5 border border-line rounded-full px-3.5 py-1.5 text-[13.5px] font-medium hover:bg-card-alt transition-colors"
                  >
                    <Plus size={13} strokeWidth={2} /> Add question
                  </button>
                </section>

                <div className="border-t border-line" />

                {/* Screening */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1">Screening</h3>
                  <p className="text-[13.5px] text-muted mb-5">
                    Who your firm can help, and what everyone else is told. Both are required before
                    you can go live.
                  </p>

                  <label className="text-[14.5px] font-semibold block mb-2">Fit criteria</label>
                  <textarea
                    value={fitCriteria}
                    onChange={(e) => setFitCriteria(e.target.value)}
                    placeholder='e.g. "anyone going through divorce in Texas"'
                    rows={3}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none mb-2 placeholder:text-muted"
                  />
                  <p className="text-[12.5px] text-muted mb-5">
                    Describe in plain language who your firm can help. Prospects are screened against
                    this — it is never shown to them.
                  </p>

                  <label className="text-[14.5px] font-semibold block mb-2">Closing message</label>
                  <textarea
                    value={closingMessage}
                    onChange={(e) => setClosingMessage(e.target.value)}
                    placeholder="Thank you — we have your details and someone will read them…"
                    rows={2}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none mb-2 placeholder:text-muted"
                  />
                  <p className="text-[12.5px] text-muted">
                    The last thing every visitor reads once their enquiry is sent — not only the ones
                    you turn away. Say what happens next; a person decides afterwards.
                  </p>
                </section>

                <div className="border-t border-line" />

                {/* Appearance */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1">Appearance</h3>
                  <p className="text-[13.5px] text-muted mb-4">
                    Applies where the intake is embedded in your own site. Your public link keeps
                    PowerAI Law&rsquo;s own look.
                  </p>

                  <div className="inline-flex bg-card-alt rounded-full p-1 mb-5">
                    {(["light", "dark", "auto"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setAppearanceTab(t)}
                        className={`px-4 py-1.5 rounded-full text-[13.5px] font-medium capitalize transition-colors ${
                          appearanceTab === t ? "bg-white shadow-sm" : "text-muted"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    <div className="border border-line rounded-2xl p-4">
                      <div className="text-[14px] font-semibold mb-3">Light</div>
                      <div
                        className="rounded-xl p-4 mb-3"
                        style={{ backgroundColor: lightBg }}
                      >
                        <div className="text-[13.5px] font-semibold mb-2">What brings you here?</div>
                        <div className="bg-white/70 border border-line rounded-lg px-3 py-2 text-[12.5px] text-muted mb-2">
                          Tell us in a sentence...
                        </div>
                        <div
                          className="inline-block text-[12.5px] font-medium px-3 py-1.5 rounded-lg text-white"
                          style={{ backgroundColor: lightAccent }}
                        >
                          Send
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-[12.5px] text-muted">Background</span>
                        <input
                          value={lightBg}
                          onChange={(e) => setLightBg(e.target.value)}
                          className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] w-[100px] outline-none mono"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] text-muted">Accent</span>
                        <input
                          value={lightAccent}
                          onChange={(e) => setLightAccent(e.target.value)}
                          className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] w-[100px] outline-none mono"
                        />
                      </div>
                    </div>

                    <div className="border border-line rounded-2xl p-4">
                      <div className="text-[14px] font-semibold mb-3">Dark</div>
                      <div className="rounded-xl p-4 mb-3" style={{ backgroundColor: darkBg }}>
                        <div className="text-[13.5px] font-semibold mb-2" style={{ color: darkAccent }}>
                          What brings you here?
                        </div>
                        <div
                          className="border rounded-lg px-3 py-2 text-[12.5px] mb-2"
                          style={{ borderColor: darkAccent + "40", color: darkAccent + "99" }}
                        >
                          Tell us in a sentence...
                        </div>
                        <div
                          className="inline-block text-[12.5px] font-medium px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: darkAccent, color: darkBg }}
                        >
                          Send
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-[12.5px] text-muted">Background</span>
                        <input
                          value={darkBg}
                          onChange={(e) => setDarkBg(e.target.value)}
                          className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] w-[100px] outline-none mono"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] text-muted">Accent</span>
                        <input
                          value={darkAccent}
                          onChange={(e) => setDarkAccent(e.target.value)}
                          className="border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] w-[100px] outline-none mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium">
                      Show &ldquo;Powered by PowerAI Law&rdquo; in the widget
                    </span>
                    <button
                      onClick={() => setShowPoweredBy((s) => !s)}
                      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                        showPoweredBy ? "bg-dark" : "bg-line"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                          showPoweredBy ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </section>

                <div className="border-t border-line" />

                {/* Put on site */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1">Put the form on your website</h3>
                  <p className="text-[13.5px] text-muted mb-5">
                    Two ways to use it. The link needs no setup; the snippet puts the form inside your
                    own page.
                  </p>

                  <div className="flex gap-3 mb-5">
                    <div className="w-6 h-6 rounded-full bg-card-alt flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="text-[14.5px] font-semibold mb-1">Share the direct link</div>
                      <p className="text-[13px] text-muted mb-2.5">
                        Put this anywhere — a button on your site, an email signature, a social
                        profile.
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 border border-line rounded-xl px-3.5 py-2.5 mono text-[13px] bg-white truncate">
                          {directLink}
                        </div>
                        <button
                          onClick={() => copy(directLink, "link")}
                          className="flex items-center gap-1.5 border border-line rounded-xl px-3.5 py-2.5 text-[13px] font-medium hover:bg-card-alt transition-colors flex-shrink-0"
                        >
                          <Copy size={13} strokeWidth={1.75} />
                          {copiedKey === "link" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mb-5">
                    <div className="w-6 h-6 rounded-full bg-card-alt flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="text-[14.5px] font-semibold mb-1">Or embed it in a page</div>
                      <p className="text-[13px] text-muted mb-2.5">
                        Paste this where the form should appear.
                      </p>
                      <div className="flex items-start gap-2">
                        <pre className="flex-1 border border-line rounded-xl px-3.5 py-2.5 mono text-[12px] bg-white overflow-x-auto whitespace-pre-wrap">
                          {embedSnippet}
                        </pre>
                        <button
                          onClick={() => copy(embedSnippet, "embed")}
                          className="flex items-center gap-1.5 border border-line rounded-xl px-3.5 py-2.5 text-[13px] font-medium hover:bg-card-alt transition-colors flex-shrink-0"
                        >
                          <Copy size={13} strokeWidth={1.75} />
                          {copiedKey === "embed" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[12.5px] text-muted mt-2">
                        The form loads in a sandboxed frame, so it cannot read or change the rest of
                        your page — and your page&rsquo;s styles cannot break it.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 mb-5">
                    <div className="w-6 h-6 rounded-full bg-card-alt flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="text-[14.5px] font-semibold mb-1">
                        Limit which websites may embed it
                      </div>
                      <p className="text-[13px] text-muted mb-2.5">
                        Leave this empty and the form works on any site. Add your domains and it will
                        only start on those, so nobody else can put your intake on their page.
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={domainInput}
                          onChange={(e) => setDomainInput(e.target.value)}
                          placeholder="example.com or *.example.com"
                          className="flex-1 border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none placeholder:text-muted"
                        />
                        <button
                          onClick={() => {
                            if (domainInput.trim()) {
                              setDomains((d) => [...d, domainInput.trim()]);
                              setDomainInput("");
                            }
                          }}
                          className="flex items-center gap-1.5 border border-line rounded-xl px-3.5 py-2.5 text-[13px] font-medium hover:bg-card-alt transition-colors flex-shrink-0"
                        >
                          <Plus size={13} strokeWidth={2} /> Add
                        </button>
                      </div>
                      {domains.length === 0 ? (
                        <p className="text-[12.5px] text-muted">Any website may embed this form.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {domains.map((d) => (
                            <div
                              key={d}
                              className="bg-card-alt rounded-full px-3 py-1 text-[12.5px] font-medium flex items-center gap-1.5"
                            >
                              {d}
                              <button
                                onClick={() => setDomains((ds) => ds.filter((x) => x !== d))}
                                className="text-muted hover:text-ink"
                              >
                                <X size={11} strokeWidth={2} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-8">
                    <button className="bg-dark text-white px-5 py-2.5 rounded-full text-[14px] font-semibold hover:bg-dark2 transition-colors">
                      Save Changes
                    </button>
                    <button
                      onClick={() => setPreviewing((p) => !p)}
                      className="flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink transition-colors"
                    >
                      <FlaskConical size={15} strokeWidth={1.75} /> Preview
                    </button>
                  </div>
                </section>

                <div className="border-t border-line" />

                {/* Public intake page */}
                <section>
                  <h3 className="text-[17px] font-semibold mb-1">Public intake page</h3>
                  <p className="text-[13.5px] text-muted mb-3">
                    The link goes live on its own once the form is complete.{" "}
                    {missing.length > 0 && "Still missing:"}
                  </p>
                  {missing.length > 0 && (
                    <ul className="mb-3 flex flex-col gap-1">
                      {missing.map((m) => (
                        <li key={m} className="text-[13px] text-red-500 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-red-500" /> {m}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 border border-line rounded-xl px-3.5 py-2.5 mono text-[13px] bg-white truncate">
                      {directLink}
                    </div>
                    <button
                      onClick={() => copy(directLink, "public")}
                      className="border border-line rounded-xl p-2.5 hover:bg-card-alt transition-colors flex-shrink-0"
                    >
                      <Copy size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                  <p className="text-[12.5px] text-muted">
                    Share it on your website or in emails. Editing the form never interrupts intakes
                    already in progress.
                  </p>
                </section>
              </div>

              {/* Live preview panel */}
              <div className="lg:sticky lg:top-0 h-fit">
                <div className="border border-dashed border-line rounded-2xl min-h-[420px] flex items-center justify-center p-6">
                  {previewing ? (
                    <div
                      className="rounded-2xl p-5 w-full"
                      style={{
                        backgroundColor: appearanceTab === "dark" ? darkBg : lightBg,
                      }}
                    >
                      <div
                        className="text-[15px] font-semibold mb-3"
                        style={{ color: appearanceTab === "dark" ? darkAccent : lightAccent }}
                      >
                        {headline || "How can we help?"}
                      </div>
                      <div
                        className="border rounded-xl px-3.5 py-2.5 text-[13px] mb-3"
                        style={{
                          borderColor: appearanceTab === "dark" ? darkAccent + "40" : "#e7dfc9",
                          color: appearanceTab === "dark" ? darkAccent + "99" : "#63666f",
                        }}
                      >
                        Tell us in a sentence...
                      </div>
                      <div
                        className="inline-block text-[13px] font-medium px-4 py-2 rounded-xl"
                        style={{
                          backgroundColor: appearanceTab === "dark" ? darkAccent : lightAccent,
                          color: appearanceTab === "dark" ? darkBg : "#ffffff",
                        }}
                      >
                        Send
                      </div>
                    </div>
                  ) : (
                    <p className="text-[14.5px] text-muted text-center leading-relaxed">
                      Save the form once and the live widget appears here.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
