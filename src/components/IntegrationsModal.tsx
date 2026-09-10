"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Settings,
  Shield,
  Grid3x3,
  Mail,
  Timer,
  X,
  ChevronRight,
  Link2,
  Trash2,
} from "lucide-react";

const navItems = [
  { key: "general", label: "General", icon: Settings },
  { key: "security", label: "Security", icon: Shield },
  { key: "integrations", label: "Integrations", icon: Grid3x3 },
  { key: "mail", label: "Mail automation", icon: Mail },
  { key: "time", label: "Time tracking", icon: Timer },
] as const;

type ConnectorKey = "google" | "microsoft" | "imap" | "telegram";

const connectors: {
  key: ConnectorKey;
  name: string;
  desc: string;
  icon: string;
  drillDown: boolean;
}[] = [
  {
    key: "google",
    name: "Google Workspace",
    desc: "Gmail, Drive, and Calendar",
    icon: "G",
    drillDown: true,
  },
  {
    key: "microsoft",
    name: "Microsoft 365",
    desc: "Outlook, OneDrive, and Calendar",
    icon: "◫",
    drillDown: true,
  },
  {
    key: "imap",
    name: "Email (IMAP)",
    desc: "Connect any other mailbox with an app password.",
    icon: "@",
    drillDown: false,
  },
  {
    key: "telegram",
    name: "Telegram",
    desc: "Run your workspace from Telegram — manage tasks, create matters, and more.",
    icon: "✈",
    drillDown: false,
  },
];

const microsoftSub = [
  {
    name: "Outlook",
    desc: "Connect Outlook so recent correspondence is read and turned into clients, matters and documents.",
  },
  {
    name: "Outlook Calendar",
    desc: "Connect your Outlook Calendar to keep events in sync both ways — events created here appear there too.",
  },
  {
    name: "OneDrive",
    desc: "Import documents from your OneDrive directly inside PowerAI Law so the assistant can reference them.",
  },
];

const googleSub = [
  {
    name: "Gmail",
    desc: "Import clients and their context — emails and files from Gmail and Drive into your matters.",
  },
  {
    name: "Google Calendar",
    desc: "Pull events into PowerAI Law and push task deadlines back to Google Calendar so nothing is missed.",
  },
  {
    name: "Google Drive",
    desc: "Search and read files from your Google Drive directly inside PowerAI Law so the assistant can reference them.",
  },
];

const timezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

const practiceAreas = [
  "Family Law",
  "Immigration",
  "Personal Injury",
  "Criminal Defense",
  "Estate Planning",
  "Probate",
  "Real Estate",
  "Business / Corporate",
  "Contracts",
  "Employment",
  "Litigation",
  "Civil Disputes",
  "Bankruptcy",
  "Intellectual Property",
  "Tax",
  "Landlord / Tenant",
  "Debt Collection",
  "Insurance",
  "Consumer Protection",
  "Other",
];

type PracticeAreaStatus = "We handle" | "Don't handle" | "Not set";

function PracticeAreaRow({
  label,
  status,
  onChange,
}: {
  label: string;
  status: PracticeAreaStatus;
  onChange: (s: PracticeAreaStatus) => void;
}) {
  const options: PracticeAreaStatus[] = ["We handle", "Don't handle", "Not set"];
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-line last:border-b-0">
      <span className="text-[14.5px] font-medium">{label}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              status === opt
                ? "bg-dark text-white"
                : "bg-white border border-line hover:bg-card-alt"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function IntegrationsModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<(typeof navItems)[number]["key"]>("integrations");
  const [drilled, setDrilled] = useState<ConnectorKey | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Dessign");
  const [urlSlug, setUrlSlug] = useState("dessign");
  const [timezone, setTimezone] = useState("America/New_York");
  const [generalSaved, setGeneralSaved] = useState(false);

  const [practiceStatus, setPracticeStatus] = useState<Record<string, PracticeAreaStatus>>(
    Object.fromEntries(practiceAreas.map((a) => [a, "Not set" as PracticeAreaStatus]))
  );
  const [scopeNotes, setScopeNotes] = useState("");
  const [practiceSaved, setPracticeSaved] = useState(false);

  const allPracticeAreasUnset = practiceAreas.every((a) => practiceStatus[a] === "Not set");

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setLogoUrl(URL.createObjectURL(file));
  }

  function handleSaveGeneral() {
    setGeneralSaved(true);
    setTimeout(() => setGeneralSaved(false), 1800);
  }

  function handleSavePracticeAreas() {
    setPracticeSaved(true);
    setTimeout(() => setPracticeSaved(false), 1800);
  }

  function handleDeleteAccount() {
    if (
      window.confirm(
        "Deletes your account and this workspace with it, for everyone in the firm. This cannot be undone. Continue?"
      )
    ) {
      onClose();
    }
  }

  const drilledConnector = connectors.find((c) => c.key === drilled);
  const subRows = drilled === "microsoft" ? microsoftSub : drilled === "google" ? googleSub : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="bg-cream rounded-3xl w-full max-w-[980px] max-h-[88vh] overflow-hidden flex">
        <div className="w-[220px] flex-shrink-0 border-r border-line px-4 py-6">
          <div className="text-[15px] font-semibold px-2 mb-5">Settings</div>
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setActive(item.key);
                    setDrilled(null);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium text-left transition-colors ${
                    active === item.key
                      ? "bg-card-alt text-ink"
                      : "text-muted hover:bg-card-alt hover:text-ink"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-9 pt-8 pb-2">
            <div className="flex items-center gap-2 text-[14px] font-medium text-muted">
              {drilledConnector ? (
                <>
                  <span className="text-[13px]">{drilledConnector.icon}</span>
                  <button onClick={() => setDrilled(null)} className="hover:text-ink transition-colors">
                    Integrations
                  </button>
                  <span>/</span>
                  <span className="text-ink font-semibold">{drilledConnector.name}</span>
                </>
              ) : (
                (() => {
                  const current = navItems.find((n) => n.key === active)!;
                  const Icon = current.icon;
                  return (
                    <>
                      <Icon size={15} strokeWidth={1.75} className="text-ink" />
                      <span className="text-ink">{current.label}</span>
                    </>
                  );
                })()
              )}
            </div>
            <button onClick={onClose} className="text-muted hover:text-ink">
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-9 pb-9">
            {active === "general" ? (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">General</h2>
                <p className="text-[14px] text-muted mb-8">Manage your organization details</p>

                <div className="mb-7">
                  <div className="text-[14.5px] font-semibold mb-3">Workspace logo</div>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-card-alt flex items-center justify-center text-[18px] font-semibold text-ink overflow-hidden flex-shrink-0">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="Workspace logo" className="w-full h-full object-cover" />
                      ) : (
                        orgName.charAt(0).toUpperCase() || "?"
                      )}
                    </div>
                    <label className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors cursor-pointer">
                      Upload
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-[12.5px] text-muted mt-2.5">PNG, JPEG or WebP, up to 2 MB.</p>
                </div>

                <div className="mb-6">
                  <div className="text-[14.5px] font-semibold mb-2">Organization Name</div>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                  />
                </div>

                <div className="mb-6">
                  <div className="text-[14.5px] font-semibold mb-2">URL Slug</div>
                  <input
                    value={urlSlug}
                    onChange={(e) => setUrlSlug(e.target.value)}
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                  />
                </div>

                <div className="mb-3">
                  <div className="text-[14.5px] font-semibold mb-2">Firm time zone</div>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none appearance-none"
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <p className="text-[12.5px] text-muted mt-2.5">
                    Your firm&apos;s saved operating time zone. Existing calendar event times stay unchanged.
                  </p>
                </div>

                <div className="flex items-center gap-3 mb-9">
                  <button
                    onClick={handleSaveGeneral}
                    className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                  >
                    Save Changes
                  </button>
                  {generalSaved && <span className="text-[13px] text-green-600 font-medium">Saved</span>}
                </div>

                <div className="border-t border-line pt-8 mb-8">
                  <div className="text-[15px] font-semibold mb-1.5">Practice areas</div>
                  <p className="text-[13.5px] text-muted max-w-[640px]">
                    Tell the intake assistant what your firm does. It uses this to answer prospects
                    asking whether you can help — and never guesses beyond it.
                  </p>
                  {allPracticeAreasUnset && (
                    <p className="text-[13.5px] text-muted italic mt-4 max-w-[640px]">
                      Nothing is set yet, so the intake chat will not confirm or rule out any area of
                      law. It will keep collecting details and leave the decision to you.
                    </p>
                  )}
                </div>

                <div className="mb-8">
                  {practiceAreas.map((area) => (
                    <PracticeAreaRow
                      key={area}
                      label={area}
                      status={practiceStatus[area]}
                      onChange={(s) => setPracticeStatus((prev) => ({ ...prev, [area]: s }))}
                    />
                  ))}
                </div>

                <div className="mb-8">
                  <div className="text-[14.5px] font-semibold mb-2">Scope notes</div>
                  <textarea
                    value={scopeNotes}
                    onChange={(e) => setScopeNotes(e.target.value)}
                    placeholder="e.g. we only take cases in Ontario, and injury claims above $10,000"
                    rows={3}
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-3 text-[14px] outline-none resize-none"
                  />
                  <p className="text-[12.5px] text-muted mt-2.5">
                    Anything the list above cannot capture — jurisdictions, minimum claim sizes,
                    matters you refer out. Prospects never see this text.
                  </p>
                </div>

                <div className="flex items-center gap-3 mb-10">
                  <button
                    onClick={handleSavePracticeAreas}
                    className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                  >
                    Save practice areas
                  </button>
                  {practiceSaved && <span className="text-[13px] text-green-600 font-medium">Saved</span>}
                </div>

                <div className="border border-red-200 bg-red-50/40 rounded-2xl p-5 flex items-center justify-between gap-6 flex-wrap">
                  <div>
                    <div className="text-[14.5px] font-semibold mb-1">Delete account</div>
                    <p className="text-[13px] text-muted max-w-[520px]">
                      Deletes your account and this workspace with it, for everyone in the firm. An
                      active subscription is cancelled automatically.
                    </p>
                  </div>
                  <button
                    onClick={handleDeleteAccount}
                    className="flex items-center gap-1.5 bg-red-100 text-red-600 px-4 py-2 rounded-full text-[13px] font-medium hover:bg-red-200 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={13} strokeWidth={1.75} /> Delete account
                  </button>
                </div>
              </>
            ) : active !== "integrations" ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-[15px] font-medium text-muted">
                  {navItems.find((n) => n.key === active)?.label} settings coming soon.
                </div>
              </div>
            ) : drilledConnector ? (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">{drilledConnector.name}</h2>
                <p className="text-[14px] text-muted mb-7">{drilledConnector.desc}.</p>

                <div className="border-t border-dashed border-line pt-5 mb-2 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[15px] font-semibold mb-1">Connect everything at once</div>
                    <p className="text-[13.5px] text-muted">
                      One consent for mail, calendar and drive instead of three.
                    </p>
                  </div>
                  <Link
                    href="/connect"
                    className="flex items-center gap-1.5 bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
                  >
                    <Link2 size={13} strokeWidth={1.75} /> Connect all
                  </Link>
                </div>

                <div className="flex flex-col divide-y divide-line border-t border-line mt-4">
                  {subRows.map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <div className="text-[14.5px] font-semibold mb-0.5">{row.name}</div>
                        <div className="text-[12.5px] text-muted max-w-[520px]">{row.desc}</div>
                      </div>
                      <Link
                        href="/connect"
                        className="flex items-center gap-1.5 bg-dark text-white px-4 py-2 rounded-full text-[13px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
                      >
                        <Link2 size={12} strokeWidth={1.75} /> Connect
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">Integrations</h2>
                <p className="text-[14px] text-muted mb-7">
                  Connect external services to your organization.
                </p>

                <div className="texture-beige rounded-3xl p-8 mb-8">
                  <div className="flex items-center gap-1.5 mb-5 text-[15px] font-semibold">
                    <span>@</span>
                    <span className="w-4 h-4 rounded-sm bg-dark text-white flex items-center justify-center text-[9px]">
                      P
                    </span>
                  </div>
                  <h3 className="text-[26px] font-semibold mb-3 leading-tight">
                    Import your entire client base
                    <br />
                    from your inbox
                  </h3>
                  <p className="text-[14px] text-muted mb-6 max-w-[440px]">
                    Gmail or Outlook — emails, files, and events automatically turned into clients
                    and matters.
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <Link
                      href="/connect"
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                    >
                      ↗ Import from Gmail
                    </Link>
                    <Link
                      href="/connect"
                      className="border border-line bg-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors"
                    >
                      ↗ Import from Outlook
                    </Link>
                    <span className="text-[13.5px] font-medium text-ink underline cursor-pointer">
                      Learn more
                    </span>
                  </div>
                </div>

                <div className="flex flex-col divide-y divide-line border-t border-line">
                  {connectors.map((c) =>
                    c.drillDown ? (
                      <button
                        key={c.key}
                        onClick={() => setDrilled(c.key)}
                        className="flex items-center justify-between py-4 hover:bg-card-alt transition-colors -mx-2 px-2 rounded-lg text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-card-alt flex items-center justify-center text-[15px]">
                            {c.icon}
                          </div>
                          <div>
                            <div className="text-[14.5px] font-semibold">{c.name}</div>
                            <div className="text-[12.5px] text-muted">{c.desc}</div>
                          </div>
                        </div>
                        <ChevronRight size={16} strokeWidth={1.75} className="text-muted" />
                      </button>
                    ) : (
                      <div key={c.key} className="flex items-center justify-between py-4 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-card-alt flex items-center justify-center text-[15px] flex-shrink-0">
                            {c.icon}
                          </div>
                          <div>
                            <div className="text-[14.5px] font-semibold">{c.name}</div>
                            <div className="text-[12.5px] text-muted max-w-[440px]">{c.desc}</div>
                          </div>
                        </div>
                        <button className="bg-dark text-white px-4 py-2 rounded-full text-[13px] font-medium hover:bg-dark2 transition-colors flex-shrink-0">
                          Connect
                        </button>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
