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
  Fingerprint,
  ChevronsUpDown,
  Lock,
} from "lucide-react";

const navItems = [
  { key: "general", label: "General", icon: Settings },
  { key: "security", label: "Security", icon: Shield },
  { key: "integrations", label: "Integrations", icon: Grid3x3 },
  { key: "mail", label: "Mail automation", icon: Mail },
  { key: "time", label: "Time tracking", icon: Timer },
] as const;

type ConnectorKey = "google" | "microsoft";

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

function SecurityCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="text-[15px] font-semibold">{title}</div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function RateStepperField({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-center bg-white border border-line rounded-xl px-3.5 py-2.5 ${className}`}
    >
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none text-[14px] pr-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <ChevronsUpDown size={14} strokeWidth={1.75} className="text-muted absolute right-3.5 pointer-events-none" />
    </div>
  );
}

function SettingsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
        checked ? "bg-dark justify-end" : "bg-line justify-start"
      }`}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

type MailPolicy = "Always ask" | "One tap" | "Allow auto";

const mailCategories: { key: string; label: string; locked: boolean }[] = [
  { key: "court", label: "Court / tribunal", locked: true },
  { key: "service", label: "Service of process", locked: true },
  { key: "deadline", label: "Deadline-bearing", locked: true },
  { key: "government", label: "Government / regulatory", locked: false },
  { key: "opposing", label: "Opposing counsel", locked: false },
  { key: "client", label: "Client instructions", locked: false },
  { key: "payment", label: "Payment / wire", locked: false },
  { key: "bar", label: "Bar / malpractice", locked: false },
  { key: "prospect", label: "Prospect inquiry", locked: false },
  { key: "sensitivity", label: "Sensitivity-flagged", locked: false },
];

const protectedKinds = ["Court", "Client", "Opposing counsel", "Regulator", "Other"];

function MailCategoryRow({
  label,
  locked,
  value,
  onChange,
}: {
  label: string;
  locked: boolean;
  value: MailPolicy;
  onChange: (v: MailPolicy) => void;
}) {
  const options: MailPolicy[] = ["Always ask", "One tap", "Allow auto"];
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-line last:border-b-0">
      <span className="flex items-center gap-1.5 text-[14.5px] font-medium">
        {label}
        {locked && <Lock size={12} strokeWidth={1.75} className="text-muted" />}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {options.map((opt) => {
          const disabled = locked && opt !== "Always ask";
          const selected = locked ? opt === "Always ask" : value === opt;
          return (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => !disabled && onChange(opt)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                selected
                  ? "bg-dark text-white"
                  : disabled
                  ? "bg-white border border-line text-muted-light cursor-not-allowed"
                  : "bg-white border border-line hover:bg-card-alt"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SettingsTabKey = (typeof navItems)[number]["key"];

export default function IntegrationsModal({
  onClose,
  initialTab = "integrations",
}: {
  onClose: () => void;
  initialTab?: SettingsTabKey;
}) {
  const [active, setActive] = useState<SettingsTabKey>(initialTab);
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

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const [standardRate, setStandardRate] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [billAt, setBillAt] = useState("The firm default rate");
  const [lawyerRate, setLawyerRate] = useState<string | null>(null);
  const [promptIdleTimer, setPromptIdleTimer] = useState(true);
  const [warnLongTimer, setWarnLongTimer] = useState(true);
  const [roundDurations, setRoundDurations] = useState(true);
  const [requireNonBillableReason, setRequireNonBillableReason] = useState(true);

  const [startWithSignature, setStartWithSignature] = useState(true);
  const [signatureText, setSignatureText] = useState("");
  const [signatureSaved, setSignatureSaved] = useState(false);

  const [categoryPolicy, setCategoryPolicy] = useState<Record<string, MailPolicy>>(
    Object.fromEntries(mailCategories.map((c) => [c.key, "Always ask" as MailPolicy]))
  );
  const [autoFileEnabled, setAutoFileEnabled] = useState(true);
  const [autoFileThreshold, setAutoFileThreshold] = useState("0.9");
  const [autoScreenThreshold, setAutoScreenThreshold] = useState("0.95");
  const [autoScreenEnabled, setAutoScreenEnabled] = useState(true);
  const [policySaved, setPolicySaved] = useState(false);

  const [protectedEntries, setProtectedEntries] = useState<{ address: string; kind: string }[]>([]);
  const [newProtectedAddress, setNewProtectedAddress] = useState("");
  const [newProtectedKind, setNewProtectedKind] = useState("Court");

  function handleSaveSignature() {
    setSignatureSaved(true);
    setTimeout(() => setSignatureSaved(false), 1800);
  }

  function handleSavePolicy() {
    setPolicySaved(true);
    setTimeout(() => setPolicySaved(false), 1800);
  }

  function handleAddProtectedEntry() {
    if (!newProtectedAddress.trim()) return;
    setProtectedEntries((prev) => [...prev, { address: newProtectedAddress.trim(), kind: newProtectedKind }]);
    setNewProtectedAddress("");
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
            ) : active === "security" ? (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">Security</h2>
                <p className="text-[14px] text-muted mb-8">
                  Manage two-factor authentication and passkeys for your account
                </p>

                <SecurityCard title="Password">
                  <p className="text-[13.5px] text-muted mb-4 max-w-[520px]">
                    Change your password and optionally sign out every other active device.
                  </p>
                  <button className="bg-white border border-line px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors">
                    Change password
                  </button>
                </SecurityCard>

                <SecurityCard
                  title="Authenticator app"
                  badge={
                    <span className="text-[13px] text-muted flex-shrink-0">
                      {twoFactorEnabled ? "Enabled" : "Disabled"}
                    </span>
                  }
                >
                  <p className="text-[13.5px] text-muted mb-4 max-w-[520px]">
                    Protect your account with one-time codes from Google Authenticator or any
                    other authenticator app.
                  </p>
                  <button
                    onClick={() => setTwoFactorEnabled((v) => !v)}
                    className={`px-4 py-2.5 rounded-full text-[13.5px] font-medium transition-colors ${
                      twoFactorEnabled
                        ? "bg-white border border-line hover:bg-card-alt"
                        : "bg-dark text-white hover:bg-dark2"
                    }`}
                  >
                    {twoFactorEnabled ? "Disable two-factor authentication" : "Enable two-factor authentication"}
                  </button>
                </SecurityCard>

                <SecurityCard
                  title="Passkeys"
                  badge={
                    <button className="flex items-center gap-1.5 bg-white border border-line px-3.5 py-2 rounded-full text-[13px] font-medium hover:bg-card-alt transition-colors flex-shrink-0">
                      <Fingerprint size={14} strokeWidth={1.75} /> Add passkey
                    </button>
                  }
                >
                  <p className="text-[13.5px] text-muted max-w-[520px]">
                    Sign in with Face ID, Touch ID, Windows Hello, or a hardware security key
                    instead of your password.
                  </p>
                </SecurityCard>

                <SecurityCard title="Connected applications">
                  <p className="text-[13.5px] text-muted mb-4 max-w-[520px]">
                    Review or revoke AI tools connected through Sign in with PowerAI Law.
                  </p>
                  <button className="bg-white border border-line px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-card-alt transition-colors">
                    Manage connected applications
                  </button>
                </SecurityCard>
              </>
            ) : active === "time" ? (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">Time tracking</h2>
                <p className="text-[14px] text-muted mb-8">
                  Idle detection, rounding, and non-billable defaults for everyone in this org.
                </p>

                <div className="mb-2">
                  <div className="text-[14.5px] font-semibold mb-2">Standard hourly rate</div>
                  <div className="flex items-center gap-3">
                    <RateStepperField
                      value={standardRate}
                      onChange={setStandardRate}
                      placeholder="No default"
                      className="flex-1 max-w-[420px]"
                    />
                    <div className="relative">
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="bg-white border border-line rounded-xl pl-3.5 pr-8 py-2.5 text-[14px] outline-none appearance-none"
                      >
                        {["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[12.5px] text-muted mt-2.5">
                    Applied when a matter has no custom rate. Leave empty for no default.
                  </p>
                </div>

                <div className="mt-7 mb-2">
                  <div className="text-[14.5px] font-semibold mb-2">Bill at</div>
                  <select
                    value={billAt}
                    onChange={(e) => setBillAt(e.target.value)}
                    className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none appearance-none"
                  >
                    <option>The firm default rate</option>
                    <option>Each lawyer&apos;s individual rate</option>
                  </select>
                  <p className="text-[12.5px] text-muted mt-2.5">
                    A rate set on a matter always wins, in either mode. Switching this does not
                    reprice time that has already been logged.
                  </p>
                </div>

                <div className="mt-7 mb-2">
                  <div className="text-[14.5px] font-semibold mb-1.5">Rates by lawyer</div>
                  <p className="text-[13.5px] text-muted mb-4 max-w-[640px]">
                    {billAt === "The firm default rate"
                      ? "The firm currently bills at its default rate, so these are kept on file but not applied. Switch the billing mode above to use them."
                      : "The firm bills at each lawyer's individual rate. Set a custom rate below, or leave it on firm default."}
                  </p>
                  <div className="flex items-center justify-between gap-4 py-1">
                    <span className="text-[13.5px] text-muted">
                      {lawyerRate ? "marios@dessign.co" : "No rate set — bills at no rate"}
                    </span>
                    <RateStepperField
                      value={lawyerRate}
                      onChange={setLawyerRate}
                      placeholder="Firm default"
                      className="w-[170px] flex-shrink-0"
                    />
                  </div>
                </div>

                <div className="mt-8 flex flex-col divide-y divide-line border-t border-line">
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[14px] font-medium">Prompt when timer has been idle</span>
                    <SettingsToggle checked={promptIdleTimer} onChange={setPromptIdleTimer} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[14px] font-medium">
                      Warn when a timer has been running for a long time
                    </span>
                    <SettingsToggle checked={warnLongTimer} onChange={setWarnLongTimer} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[14px] font-medium">Round durations on save</span>
                    <SettingsToggle checked={roundDurations} onChange={setRoundDurations} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[14px] font-medium">
                      Require a non-billable reason when an entry is marked non-billable
                    </span>
                    <SettingsToggle
                      checked={requireNonBillableReason}
                      onChange={setRequireNonBillableReason}
                    />
                  </div>
                </div>
              </>
            ) : active === "mail" ? (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">Mail automation</h2>
                <p className="text-[14px] text-muted mb-8 max-w-[720px]">
                  Every rule that touches your mail lives here — the category policy, sender
                  rules, muted senders, and protected lists. Nothing acts from a hidden heuristic.
                </p>

                <div className="mb-2">
                  <div className="text-[15px] font-semibold mb-1.5">Your email signature</div>
                  <p className="text-[13.5px] text-muted mb-4 max-w-[720px]">
                    Added to the bottom of a reply when you open it, so you can edit or delete it
                    before sending. It survives a draft written by PowerAI Law.
                  </p>

                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <div className="text-[14px] font-medium mb-0.5">Start replies with my signature</div>
                      <p className="text-[12.5px] text-muted">
                        Off leaves the editor empty — useful if you sign off differently per matter.
                      </p>
                    </div>
                    <SettingsToggle checked={startWithSignature} onChange={setStartWithSignature} />
                  </div>

                  <div className="text-[14.5px] font-semibold mb-2">Signature</div>
                  <textarea
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value.slice(0, 4000))}
                    placeholder={
                      "Saul Goodman\nPartner, Tax & Drugs Law Firm\n+1 505 503 4455 · saul@example.com\n\nThis message is confidential and may be privileged. If you received it in error, please delete it and notify the sender."
                    }
                    rows={7}
                    className="w-full bg-white border border-line rounded-xl px-4 py-3.5 text-[13.5px] font-mono outline-none resize-y placeholder:text-muted-light"
                  />
                  <div className="text-[12.5px] text-muted-light mt-1.5">{signatureText.length} / 4000</div>

                  <div className="flex items-center gap-3 mt-3 mb-9">
                    <button
                      onClick={handleSaveSignature}
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                    >
                      Save signature
                    </button>
                    {signatureSaved && <span className="text-[13px] text-green-600 font-medium">Saved</span>}
                  </div>
                </div>

                <div className="border-t border-line pt-8 mb-2">
                  <div className="text-[15px] font-semibold mb-1.5">Category policy</div>
                  <p className="text-[13.5px] text-muted mb-4">
                    How automation may treat each protected mail category.
                  </p>

                  <div className="flex flex-col">
                    {mailCategories.map((cat) => (
                      <MailCategoryRow
                        key={cat.key}
                        label={cat.label}
                        locked={cat.locked}
                        value={categoryPolicy[cat.key]}
                        onChange={(v) => setCategoryPolicy((prev) => ({ ...prev, [cat.key]: v }))}
                      />
                    ))}
                  </div>

                  <p className="text-[13px] text-muted mt-5 max-w-[820px]">
                    Locked categories are floor-locked to &quot;Always ask&quot;: missing a court
                    order, service of process, or a deadline is catastrophic, so no setting can
                    loosen them.
                  </p>
                  <p className="text-[13px] text-muted mt-3 mb-7 max-w-[820px]">
                    With auto-file on, a filing suggestion at or above the threshold is filed for
                    you and listed in Handled, where it can be undone for seven days. Locked
                    categories are never auto-filed.
                  </p>

                  <div className="flex items-center gap-8 flex-wrap mb-2 text-[12.5px] text-muted font-medium">
                    <span className="w-[200px] flex-shrink-0" />
                    <span>Auto-file confidence threshold</span>
                    <span>Auto-screen confidence threshold</span>
                  </div>
                  <div className="flex items-center gap-8 flex-wrap mb-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[14px] font-medium w-[200px]">Auto-file high-confidence mail</span>
                      <SettingsToggle checked={autoFileEnabled} onChange={setAutoFileEnabled} />
                    </div>
                    <RateStepperField
                      value={autoFileThreshold}
                      onChange={(v) => setAutoFileThreshold(v ?? "0.9")}
                      placeholder="0.9"
                      className="w-[110px]"
                    />
                    <RateStepperField
                      value={autoScreenThreshold}
                      onChange={(v) => setAutoScreenThreshold(v ?? "0.95")}
                      placeholder="0.95"
                      className="w-[110px]"
                    />
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[14px] font-medium w-[200px]">Auto-screen enabled</span>
                    <SettingsToggle checked={autoScreenEnabled} onChange={setAutoScreenEnabled} />
                  </div>

                  <div className="flex items-center gap-3 mb-9">
                    <button
                      onClick={handleSavePolicy}
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                    >
                      Save policy
                    </button>
                    {policySaved && <span className="text-[13px] text-green-600 font-medium">Saved</span>}
                  </div>
                </div>

                <div className="border-t border-line pt-8 mb-8">
                  <div className="text-[15px] font-semibold mb-1.5">Sender rules</div>
                  <p className="text-[13.5px] text-muted mb-3">
                    Rules minted from your inbox decisions. A paused rule stays listed but never fires.
                  </p>
                  <p className="text-[13.5px] text-muted-light">
                    No sender rules yet. Accepting or dismissing suggestions in the inbox can create them.
                  </p>
                </div>

                <div className="border-t border-line pt-8 mb-8">
                  <div className="text-[15px] font-semibold mb-1.5">Muted senders</div>
                  <p className="text-[13.5px] text-muted mb-3">
                    Mail from these senders is screened out automatically.
                  </p>
                  <p className="text-[13.5px] text-muted-light">No muted senders.</p>
                </div>

                <div className="border-t border-line pt-8 mb-8">
                  <div className="text-[15px] font-semibold mb-1.5">Protected senders and domains</div>
                  <p className="text-[13.5px] text-muted mb-4 max-w-[720px]">
                    Mail from these addresses or domains is always protected from automation, no
                    matter what the heuristics say.
                  </p>

                  {protectedEntries.length === 0 ? (
                    <p className="text-[13.5px] text-muted-light mb-5">No protected entries yet.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-line border-t border-b border-line mb-5">
                      {protectedEntries.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between gap-4 py-3">
                          <span className="text-[13.5px] font-medium">{entry.address}</span>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="bg-card-alt px-3 py-1 rounded-full text-[12.5px] font-medium">
                              {entry.kind}
                            </span>
                            <button
                              onClick={() =>
                                setProtectedEntries((prev) => prev.filter((_, idx) => idx !== i))
                              }
                              className="text-muted hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <div className="text-[13px] text-muted mb-1.5">Address or domain</div>
                      <input
                        value={newProtectedAddress}
                        onChange={(e) => setNewProtectedAddress(e.target.value)}
                        placeholder="clerk@nysd.uscourts.gov or uscourts.gov"
                        className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                      />
                    </div>
                    <div>
                      <div className="text-[13px] text-muted mb-1.5">Kind</div>
                      <select
                        value={newProtectedKind}
                        onChange={(e) => setNewProtectedKind(e.target.value)}
                        className="bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none appearance-none"
                      >
                        {protectedKinds.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleAddProtectedEntry}
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="border-t border-line pt-6">
                  <p className="text-[13px] text-muted">
                    Every automated action is recorded and reviewable (and undoable) in the{" "}
                    <span className="underline">Handled feed</span>.
                  </p>
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
