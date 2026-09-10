const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Integrations", href: "#integrations" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
];

const trailSteps = [
  {
    icon: "✉",
    title: "New email received",
    meta: "09:14 AM · Client: Whitfield Estate",
    tag: "Attachment: Petition_Draft.pdf",
  },
  {
    icon: "→",
    title: "Assigned to team member",
    meta: "Auto-routed · Sarah Chen, Associate",
  },
  {
    icon: "▤",
    title: "Task created in Planner",
    meta: "Board: Estate Litigation · Bucket: Intake",
  },
  {
    icon: "⚖",
    title: "Linked to Law Software matter",
    meta: "Matter #4471 · Whitfield, R.",
  },
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
    desc: "Tell PowerAI Law how you want work distributed — by practice area, matter, or team member.",
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

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 font-display font-semibold text-[19px] ${
        light ? "text-white" : "text-ink"
      }`}
    >
      <div
        className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[15px] font-bold ${
          light ? "bg-white text-dark" : "bg-dark text-white"
        }`}
      >
        P
      </div>
      PowerAI Law
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* HERO — split dark / beige, nav embedded */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        {/* LEFT: dark panel */}
        <div className="bg-dark text-white px-8 md:px-14 pt-8 pb-16 flex flex-col">
          <nav className="flex items-center justify-between mb-20 md:mb-28">
            <Logo light />
            <div className="hidden lg:flex gap-8 text-[14px] font-medium text-muted-light">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="max-w-[480px]">
            <h1 className="text-[40px] md:text-[52px] font-semibold mb-6 text-white">
              Legal ops automation, built for law firms.
            </h1>
            <p className="text-[16.5px] text-muted-light leading-relaxed mb-9">
              PowerAI Law watches your firm&rsquo;s inbox, assigns incoming
              documents to the right team member, and keeps Microsoft Planner
              and your law software in sync — so nothing sits unclaimed and
              nobody has to ask &ldquo;who has this file?&rdquo;
            </p>
            <a
              href="#pricing"
              className="inline-block bg-white text-ink px-6 py-3.5 rounded-full text-[15px] font-medium hover:bg-cream transition-colors"
            >
              Start free trial
            </a>

            <div className="flex items-center gap-3 mt-16 pt-8 border-t border-line-dark">
              <div className="w-9 h-9 rounded-full bg-dark2 border border-line-dark flex items-center justify-center text-[13px]">
                ▶
              </div>
              <div className="text-[13.5px] text-muted-light">
                See how the intake trail works<br />
                <span className="text-white font-medium">Watch a 2-minute walkthrough</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: beige textured panel with floating trail card */}
        <div className="texture-beige relative min-h-[420px] md:min-h-full flex items-center justify-center px-6 py-10 md:py-0">
          <a
            href="#pricing"
            className="absolute top-8 right-8 bg-dark text-white px-5 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
          >
            Get Started
          </a>

          <div className="bg-white rounded-[20px] px-7 py-8 max-w-[420px] w-full shadow-[0_20px_60px_-15px_rgba(18,17,16,0.25)]">
            <div className="text-xs text-muted uppercase tracking-wider mb-5 font-semibold">
              Live matter intake trail
            </div>
            <div className="flex flex-col">
              {trailSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-4 relative pb-7 last:pb-0">
                  {i !== trailSteps.length - 1 && (
                    <span
                      className="absolute left-[19px] top-10 bottom-0 w-px opacity-30"
                      style={{
                        backgroundImage: "linear-gradient(#6e695c 40%, rgba(0,0,0,0) 0%)",
                        backgroundPosition: "left",
                        backgroundSize: "1px 6px",
                        backgroundRepeat: "repeat-y",
                      }}
                    />
                  )}
                  <div className="w-10 h-10 rounded-[11px] flex-shrink-0 border border-line bg-card-alt flex items-center justify-center text-[17px]">
                    {step.icon}
                  </div>
                  <div className="pt-0.5">
                    <div className="text-[14.5px] font-semibold text-ink">{step.title}</div>
                    <div className="mono text-[12.5px] text-muted mt-0.5">{step.meta}</div>
                    {step.tag && (
                      <div className="inline-block mt-2 text-[11.5px] bg-cream border border-line rounded-md px-2 py-0.5">
                        {step.tag}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
                href="#"
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
                  <div key={item} className="flex items-center gap-2.5 text-[#d6d3c9] text-[14.5px]">
                    <span className="w-[18px] h-[18px] rounded-full bg-white flex items-center justify-center flex-shrink-0 text-[11px] text-dark">
                      ✓
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <a
                href="#"
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
                href="#"
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
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
          <div className="text-[13px] text-muted-light">© 2026 PowerAI Law</div>
        </div>
      </footer>
    </>
  );
}
