import Link from "next/link";
import Image from "next/image";
import {
  Sparkles,
  FolderSearch,
  UserPlus,
  ListChecks,
  Timer,
  FilePen,
  ShieldCheck,
  Calculator,
  Inbox,
  Play,
  Lock,
} from "lucide-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
];

const tools = [
  { icon: Sparkles, title: "AI Agent", desc: "Ask about any matter, client, email or deadline. It reads your workspace and drafts the next step." },
  { icon: FolderSearch, title: "AI Matter review", desc: "One click summarizes a matter, flags what’s missing and turns next steps into tasks." },
  { icon: UserPlus, title: "Client intake", desc: "A complete client card, then your intake sheet and engagement letter filled in automatically." },
  { icon: ListChecks, title: "Task boards & checklists", desc: "Drag-and-drop boards with real estate workflows that set every due date from the closing date." },
  { icon: Timer, title: "Automatic time tracking", desc: "Open a task and the clock starts. Close it and the time is on your timesheet." },
  { icon: FilePen, title: "PDF editing & e-signature", desc: "Fill forms, add text and send for signature. Clients sign on their phone; you get a certificate." },
  { icon: ShieldCheck, title: "Secure file sharing", desc: "Send or collect large files through private, password-protected links that delete themselves." },
  { icon: Calculator, title: "AI Accountant", desc: "Import bank and card statements, categorize for Schedule C and keep trust money separate." },
  { icon: Inbox, title: "Inbox & calendar", desc: "Gmail or Outlook, plus your calendar, in the same place as your matters and tasks." },
];

const security = [
  { title: "Your firm’s data stays private", desc: "Every firm has its own isolated workspace. No other firm can ever see your clients, matters or files." },
  { title: "Encrypted, in transit and at rest", desc: "Files and records are encrypted and only reachable through short-lived, signed links." },
  { title: "Not used to train AI", desc: "AI features run under business terms: your firm’s data is never used to train AI models." },
  { title: "Read-only mailbox access", desc: "LawPower reads the email folders you choose. It never moves, deletes or sends email on its own." },
];

const integrations = ["Microsoft 365", "Outlook Mail", "Microsoft Planner", "Law Software"];

const opsLabels = [
  { title: "Intake & Routing", desc: "Every new document assigned the moment it lands." },
  { title: "Visibility", desc: "Anyone on the team can see where a client's file stands." },
  { title: "Matter Sync", desc: "Documents and tasks stay linked to the right matter in your law software." },
];

const howSteps = [
  {
    num: "01",
    title: "Connect Microsoft 365",
    desc: "Sign in with your firm's Microsoft account to grant access to mail and Planner.",
  },
  {
    num: "02",
    title: "Connect your law software",
    desc: "Link your firm's law software so matters and documents stay in sync automatically.",
  },
  {
    num: "03",
    title: "Set your routing rules",
    desc: "Tell LawPower AI how you want work distributed — by practice area, matter, or team member.",
  },
  {
    num: "04",
    title: "Watch it work",
    desc: "New documents get assigned, tasked in Planner, and linked in your law software — no manual forwarding.",
  },
];

const pricingTrial = [
  "Unlimited team members",
  "Microsoft 365 & Planner integration",
  "Law software matter sync",
  "Automatic document routing",
  "Full audit trail",
];

const pricingMonthly = [
  "Unlimited team members",
  "Microsoft 365 & Planner integration",
  "Law software matter sync",
  "Automatic document routing",
  "Full audit trail",
];

const pricingYearly = [
  "Everything in Monthly",
  "2 months free",
  "Priority onboarding support",
  "Annual usage report for your firm",
];

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#1B191A" />
      <path
        d="M26 5.6C17.8 6.4 11 11.6 9.4 21.9l4.9-1.3-1.5-1 5.5-2.2-1.6-.8 5.1-3.3-1.5-.6c2.6-2 4.6-4.4 5.7-7.1z"
        fill="#fff"
      />
      <path d="M11.2 20.4 24 7.8" stroke="#1B191A" strokeWidth=".9" strokeLinecap="round" />
      <path d="M6.4 25.6 11.4 20.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 font-display font-semibold text-[21px] ${light ? "text-white" : "text-ink"}`}>
      <span className={light ? "rounded-[7px] ring-1 ring-white/25" : ""}>
        <LogoMark size={32} />
      </span>
      LawPower AI
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* HEADER */}
      <header className="bg-white border-b border-line">
        <div className="max-w-[1440px] mx-auto px-6 md:px-[110px] h-[76px] flex items-center justify-between">
          <Link href="/" aria-label="LawPower AI home">
            <Logo />
          </Link>
          <div className="flex items-center gap-7">
            <nav className="hidden lg:flex gap-7 text-[14px] font-medium text-muted">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-ink transition-colors">
                  {l.label}
                </a>
              ))}
            </nav>
            <a href="/login" className="hidden sm:inline text-[14px] font-medium text-ink hover:opacity-70 transition-opacity">
              Sign in
            </a>
            <a href="/connect" className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors">
              Get started
            </a>
          </div>
        </div>
      </header>

      {/* HERO — dark rock texture, headline box, product window */}
      <section className="px-2 md:px-4 bg-white">
        <div className="relative overflow-hidden bg-[#0b0b0b] lg:h-[790px] border border-[#2a2a2a]">
          <Image src="/hero-rock.webp" alt="" fill priority sizes="100vw" className="object-cover object-top" />
          <div className="absolute inset-0 bg-black/20" aria-hidden />

          {/* Headline */}
          <div className="relative lg:absolute lg:left-[max(40px,4.6%)] lg:top-[109px] bg-black/95 lg:w-[44%] lg:max-w-[645px] px-7 md:px-8 pt-14 lg:pt-[70px] pb-10 lg:pb-[34px]">
            <h1
              className="text-white text-[34px] md:text-[clamp(36px,3.3vw,48px)] font-semibold"
              style={{ fontFamily: "var(--font-body)", lineHeight: 1.15, letterSpacing: "-0.015em" }}
            >
              All-in-One AI Agents Workspace For Lawyers
            </h1>
            <p className="text-[#D9D9D9] text-[17px] md:text-[20px] leading-snug mt-9 md:mt-[52px] max-w-[540px]">
              LawPower AI made to support your daily work &ndash; built by lawyers, for lawyers.
            </p>
            <div className="flex flex-wrap gap-3 mt-8 lg:hidden">
              <a href="/connect" className="bg-white text-ink px-5 py-2.5 rounded-full text-[14px] font-medium">Start free trial</a>
            </div>
          </div>

          {/* See in action */}
          <a
            href="#features"
            className="group hidden lg:block absolute left-[60px] bottom-[50px] w-[240px] h-[160px] overflow-hidden ring-1 ring-white/10"
          >
            <Image src="/hero-rock-thumb.webp" alt="" fill sizes="240px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors" />
            <span className="absolute left-[46px] top-1/2 -translate-y-1/2 flex items-center gap-3 text-white text-[16px] font-medium">
              <Play size={22} fill="currentColor" strokeWidth={0} /> See in action
            </span>
          </a>

          {/* Product window */}
          <div className="relative lg:absolute lg:left-[52%] lg:top-[60px] lg:w-[1120px] mx-4 lg:mx-0 mt-6 lg:mt-0 mb-6 lg:mb-0 rounded-t-[12px] lg:rounded-tr-none overflow-hidden border border-[#3a3a3a] bg-[#1c1c1c] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="h-9 flex items-center gap-4 px-4 text-[#8c8c8c]" aria-hidden>
              <span className="flex gap-2">
                <span className="w-3 h-3 rounded-full bg-[#5a5a5a]" />
                <span className="w-3 h-3 rounded-full bg-[#5a5a5a]" />
                <span className="w-3 h-3 rounded-full bg-[#5a5a5a]" />
              </span>
              <svg width="16" height="14" viewBox="0 0 16 14" className="hidden sm:block"><rect x=".75" y=".75" width="14.5" height="12.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 1v12" stroke="currentColor" strokeWidth="1.5" /></svg>
              <span className="hidden sm:flex gap-3 text-[15px]">‹ <span className="opacity-50">›</span></span>
              <span className="flex-1 flex justify-center">
                <span className="flex items-center gap-1.5 text-[12px] text-[#bdbdbd]"><Lock size={11} /> lawpower.ai</span>
              </span>
            </div>
            <Image
              src="/hero-dashboard.webp"
              alt="The LawPower AI dashboard showing tasks due today, calendar and time tracked"
              width={2880}
              height={1800}
              priority
              sizes="(min-width: 1024px) 1120px, 100vw"
              className="block w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 bg-page" id="features">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="max-w-[640px] mb-14">
            <div className="text-[13px] font-semibold text-muted mb-3.5 uppercase tracking-wide">One workspace</div>
            <h2 className="text-[34px] md:text-[44px] font-semibold leading-tight">Everything your firm runs on, in one place.</h2>
            <p className="text-[16px] text-muted leading-relaxed mt-4">
              Clients, matters, tasks, documents, time and email, with AI agents that work across all of it. No more switching between six different programs.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((t) => (
              <div key={t.title} className="bg-card-alt rounded-[20px] p-6">
                <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-5">
                  <t.icon size={18} strokeWidth={1.75} />
                </span>
                <h3 className="text-[16.5px] font-semibold mb-1.5">{t.title}</h3>
                <p className="text-[13.5px] text-muted leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section className="py-24 bg-dark text-white" id="security">
        <div className="max-w-[1160px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-14">
          <div>
            <div className="text-[13px] font-semibold text-muted-light mb-3.5 uppercase tracking-wide">Security & confidentiality</div>
            <h2 className="text-[32px] md:text-[40px] font-semibold leading-tight text-white">Built for client confidentiality from day one.</h2>
            <p className="text-[15.5px] text-muted-light leading-relaxed mt-4">
              Lawyers owe their clients confidentiality. LawPower AI is designed around that duty, so your firm can use AI without putting client information at risk.
            </p>
            <a href="/privacy" className="inline-block mt-6 text-[14px] font-medium text-white underline underline-offset-4 decoration-white/40 hover:decoration-white">
              Read our privacy policy
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {security.map((x) => (
              <div key={x.title} className="bg-dark2 border border-line-dark rounded-[20px] p-6">
                <ShieldCheck size={18} strokeWidth={1.75} className="text-[#CAF0D9] mb-4" />
                <h3 className="text-[15.5px] font-semibold text-white mb-1.5">{x.title}</h3>
                <p className="text-[13.5px] text-muted-light leading-relaxed">{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS STRIP */}
      <section className="py-10 border-b border-line bg-cream" id="integrations">
        <div className="max-w-[1160px] mx-auto px-8 flex items-center justify-between flex-wrap gap-6">
          <div className="text-[13px] text-muted font-medium">
            Connects directly to the tools your firm already runs on
          </div>
          <div className="flex gap-9 flex-wrap">
            {integrations.map((name) => (
              <div key={name} className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                <span className="w-[7px] h-[7px] rounded-full bg-dark" />
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OPERATING SYSTEM SECTION */}
      <section className="py-24 bg-cream" id="product">
        <div className="max-w-[1160px] mx-auto px-8">
          <h2 className="text-[34px] md:text-[44px] font-semibold mb-16 max-w-[640px]">
            The operating system for law firm intake.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="flex md:flex-col gap-6 md:gap-8 flex-wrap">
              {opsLabels.map((l) => (
                <div key={l.title} className="max-w-[220px]">
                  <div className="text-[15px] font-semibold text-ink mb-1.5">{l.title}</div>
                  <div className="text-[13.5px] text-muted leading-relaxed">{l.desc}</div>
                </div>
              ))}
            </div>

            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1 — light */}
              <div className="bg-card-alt border border-line rounded-[20px] p-6 flex flex-col justify-between min-h-[280px]">
                <div>
                  <h3 className="text-[17px] font-semibold mb-2">Automatic assignment</h3>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Routes each document to the right paralegal or attorney based on
                    matter, practice area, or existing workload.
                  </p>
                </div>
                <div className="bg-white border border-line rounded-xl p-4 mt-6">
                  <div className="text-[12px] text-muted mb-2 font-medium">Auto-routed</div>
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    <span className="w-6 h-6 rounded-full bg-dark text-white flex items-center justify-center text-[11px]">
                      SC
                    </span>
                    Sarah Chen · Associate
                  </div>
                </div>
              </div>

              {/* Card 2 — dark */}
              <div className="bg-dark text-white rounded-[20px] p-6 flex flex-col justify-between min-h-[280px]">
                <div>
                  <h3 className="text-[17px] font-semibold mb-2">Planner visibility</h3>
                  <p className="text-[13.5px] text-muted-light leading-relaxed">
                    Every assignment appears as a task on your team&rsquo;s Planner
                    board, so anyone can see where a client&rsquo;s file stands.
                  </p>
                </div>
                <div className="bg-dark2 border border-line-dark rounded-xl p-4 mt-6">
                  <div className="text-[12px] text-muted-light mb-2 font-medium">
                    Board: Estate Litigation
                  </div>
                  <div className="text-[13px] font-medium">Bucket: Intake · 4 open tasks</div>
                </div>
              </div>

              {/* Card 3 — light */}
              <div className="bg-card-alt border border-line rounded-[20px] p-6 flex flex-col justify-between min-h-[280px]">
                <div>
                  <h3 className="text-[17px] font-semibold mb-2">Law software matter sync</h3>
                  <p className="text-[13.5px] text-muted leading-relaxed">
                    Keeps documents and tasks linked to the correct matter
                    number in your law software, so records stay connected end to end.
                  </p>
                </div>
                <div className="bg-white border border-line rounded-xl p-4 mt-6">
                  <div className="text-[12px] text-muted mb-2 font-medium">Matter #4471</div>
                  <div className="mono text-[13px] font-medium">Whitfield, R. · Estate</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 bg-cream border-t border-line" id="how">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="max-w-[600px] mb-14">
            <div className="text-[13px] font-semibold text-muted mb-3.5 uppercase tracking-wide">
              How it works
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold">
              Set up once. It runs in the background from day one.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 border-t border-line">
            {howSteps.map((s, i) => (
              <div
                key={s.num}
                className={`px-6 py-7 ${
                  i !== howSteps.length - 1 ? "md:border-r border-line" : ""
                }`}
              >
                <div className="mono text-[13px] text-muted mb-3.5">{s.num}</div>
                <h4 className="text-base font-semibold mb-2 font-display">{s.title}</h4>
                <p className="text-[13.5px] text-muted leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 bg-dark text-white" id="pricing">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="max-w-[600px] mb-14">
            <div className="text-[13px] font-semibold text-muted-light mb-3.5 uppercase tracking-wide">
              Pricing
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-3.5">
              One plan. Pay monthly or save yearly.
            </h2>
            <p className="text-base text-muted-light leading-relaxed">
              No per-seat pricing, no add-on tiers. Connect your whole team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1160px]">
            {/* 7-Day Free Trial */}
            <div className="bg-cream text-ink border border-line rounded-3xl p-10 flex flex-col gap-6 relative">
              <div className="absolute -top-3 left-8 bg-dark text-white text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
                No card charged for 7 days
              </div>
              <div>
                <div className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-4">
                  Free Trial
                </div>
                <div className="flex items-baseline gap-2.5">
                  <div className="font-display text-5xl font-semibold text-ink">7 days</div>
                </div>
                <div className="text-muted text-[14.5px] leading-relaxed mt-2.5">
                  Try everything in the Monthly plan, free for a week. Cancel anytime before it ends.
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {pricingTrial.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-ink text-[14.5px]">
                    <span className="w-[18px] h-[18px] rounded-full bg-dark flex items-center justify-center flex-shrink-0 text-[11px] text-white">
                      ✓
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <a
                href="/connect"
                className="bg-dark text-white py-3.5 rounded-full text-[15px] font-semibold text-center hover:bg-dark2 transition-colors mt-auto"
              >
                Start 7-day free trial
              </a>
            </div>

            {/* Monthly */}
            <div className="bg-dark2 border border-line-dark rounded-3xl p-10 flex flex-col gap-6">
              <div>
                <div className="text-[13px] font-semibold text-muted-light uppercase tracking-wide mb-4">
                  Monthly
                </div>
                <div className="flex items-baseline gap-2.5">
                  <div className="font-display text-5xl font-semibold text-white">$199</div>
                  <div className="text-muted-light text-[15px]">/ month</div>
                </div>
                <div className="text-muted-light text-[14.5px] leading-relaxed mt-2.5">
                  Billed monthly. Cancel anytime.
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {pricingMonthly.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-[#D9D9D9] text-[14.5px]">
                    <span className="w-[18px] h-[18px] rounded-full bg-white flex items-center justify-center flex-shrink-0 text-[11px] text-dark">
                      ✓
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <a
                href="/connect"
                className="bg-white text-ink py-3.5 rounded-full text-[15px] font-semibold text-center hover:bg-cream transition-colors mt-auto"
              >
                Start free trial
              </a>
            </div>

            {/* Yearly */}
            <div className="bg-cream text-ink rounded-3xl p-10 flex flex-col gap-6 relative">
              <div className="absolute -top-3 right-8 bg-dark text-white text-[11.5px] font-semibold px-3 py-1.5 rounded-full">
                2 months free
              </div>
              <div>
                <div className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-4">
                  Yearly
                </div>
                <div className="flex items-baseline gap-2.5">
                  <div className="font-display text-5xl font-semibold text-ink">$1,990</div>
                  <div className="text-muted text-[15px]">/ year</div>
                </div>
                <div className="text-muted text-[14.5px] leading-relaxed mt-2.5">
                  Equivalent to $165.83/month — 2 months free versus paying monthly.
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {pricingYearly.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-ink text-[14.5px]">
                    <span className="w-[18px] h-[18px] rounded-full bg-dark flex items-center justify-center flex-shrink-0 text-[11px] text-white">
                      ✓
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <a
                href="/connect"
                className="bg-dark text-white py-3.5 rounded-full text-[15px] font-semibold text-center hover:bg-dark2 transition-colors mt-auto"
              >
                Start free trial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 bg-dark text-white border-t border-line-dark">
        <div className="max-w-[1160px] mx-auto px-8 flex items-center justify-between flex-wrap gap-5">
          <Logo light />
          <div className="flex gap-7 text-[13.5px] text-muted-light flex-wrap">
            <a href="#product" className="hover:text-white transition-colors">Product</a>
            <a href="#integrations" className="hover:text-white transition-colors">Integrations</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
          </div>
          <div className="text-[13px] text-muted-light">© 2026 LawPower AI</div>
        </div>
      </footer>
    </>
  );
}
