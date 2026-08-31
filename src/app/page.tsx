const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Integrations", href: "#integrations" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
];

const trailSteps = [
  {
    icon: "✉",
    active: true,
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
    title: "Linked to LEAP matter",
    meta: "Matter #4471 · Whitfield, R.",
  },
];

const integrations = ["Microsoft 365", "Outlook Mail", "Microsoft Planner", "LEAP"];

const features = [
  {
    icon: "✉",
    title: "Inbox monitoring",
    desc: "Watches your firm's shared and individual mailboxes for new client documents and correspondence as they arrive.",
  },
  {
    icon: "◎",
    title: "Automatic assignment",
    desc: "Routes each document to the right paralegal or attorney based on matter, practice area, or existing workload.",
  },
  {
    icon: "▤",
    title: "Planner visibility",
    desc: "Every assignment appears as a task on your team's Planner board, so anyone can see where a client's file stands.",
  },
  {
    icon: "⚖",
    title: "LEAP matter sync",
    desc: "Keeps documents and tasks linked to the correct LEAP matter number, so records stay connected end to end.",
  },
  {
    icon: "◐",
    title: "Team workload view",
    desc: "See at a glance who's carrying the most open matters, so work gets distributed fairly across the team.",
  },
  {
    icon: "⎘",
    title: "Audit trail",
    desc: "Every routing decision is logged — when a document arrived, who it went to, and when it was actioned.",
  },
];

const howSteps = [
  {
    num: "01",
    title: "Connect Microsoft 365",
    desc: "Sign in with your firm's Microsoft account to grant access to mail and Planner.",
  },
  {
    num: "02",
    title: "Connect LEAP",
    desc: "Link your LEAP account so matters and documents stay in sync automatically.",
  },
  {
    num: "03",
    title: "Set your routing rules",
    desc: "Tell PowerAI Law how you want work distributed — by practice area, matter, or team member.",
  },
  {
    num: "04",
    title: "Watch it work",
    desc: "New documents get assigned, tasked in Planner, and linked in LEAP — no manual forwarding.",
  },
];

const pricingItems = [
  "Unlimited team members",
  "Microsoft 365 & Planner integration",
  "LEAP matter sync",
  "Automatic document routing",
  "Full audit trail",
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-display font-semibold text-[19px]">
      <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-blue to-[#7aa2ff] flex items-center justify-center text-white text-[15px] font-bold">
        P
      </div>
      PowerAI Law
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* NAV */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-line">
        <div className="max-w-[1160px] mx-auto px-8">
          <nav className="flex items-center justify-between h-[76px]">
            <Logo />
            <div className="hidden md:flex gap-9 text-[14.5px] font-medium text-muted">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-ink transition-colors">
                  {l.label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-4.5">
              <a href="#" className="text-[14.5px] font-medium text-ink">
                Sign in
              </a>
              <a
                href="#pricing"
                className="bg-ink text-white px-5 py-2.5 rounded-full text-[14.5px] font-medium hover:bg-[#25262c] transition-colors inline-flex items-center gap-1.5"
              >
                Start free trial →
              </a>
            </div>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="pt-24 pb-16">
        <div className="max-w-[1160px] mx-auto px-8 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-soft text-blue text-[13px] font-semibold px-3.5 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue" />
              Built for Microsoft 365 + LEAP firms
            </div>
            <h1 className="text-[38px] md:text-[52px] font-semibold mb-5">
              Every new matter finds its owner automatically.
            </h1>
            <p className="text-lg text-muted leading-relaxed max-w-[460px] mb-8">
              PowerAI Law watches your firm&rsquo;s inbox, assigns incoming documents to
              the right team member, and keeps Microsoft Planner and LEAP in sync —
              so nothing sits unclaimed and nobody has to ask &ldquo;who has this file?&rdquo;
            </p>
            <div className="flex items-center gap-5">
              <a
                href="#pricing"
                className="bg-ink text-white px-6.5 py-3.5 rounded-full text-[15px] font-medium hover:bg-[#25262c] transition-colors"
              >
                Start free trial
              </a>
              <a
                href="#how"
                className="text-[15px] font-medium text-ink border-b-[1.5px] border-ink pb-0.5"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-[13.5px] text-muted">
              Full access <span className="mono text-ink font-medium">$199/month</span> per
              firm · cancel anytime
            </p>
          </div>

          {/* SIGNATURE: matter intake trail */}
          <div className="bg-card border border-line rounded-[20px] px-7 py-8">
            <div className="text-xs text-muted uppercase tracking-wider mb-5 font-semibold">
              Live matter intake trail
            </div>
            <div className="flex flex-col">
              {trailSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-4 relative pb-7 last:pb-0">
                  {i !== trailSteps.length - 1 && (
                    <span
                      className="absolute left-[19px] top-10 bottom-0 w-px opacity-35"
                      style={{
                        backgroundImage:
                          "linear-gradient(#63666f 40%, rgba(0,0,0,0) 0%)",
                        backgroundPosition: "left",
                        backgroundSize: "1px 6px",
                        backgroundRepeat: "repeat-y",
                      }}
                    />
                  )}
                  <div
                    className={`w-10 h-10 rounded-[11px] flex-shrink-0 border flex items-center justify-center text-[17px] ${
                      step.active
                        ? "bg-blue-soft border-blue-soft"
                        : "bg-white border-line"
                    }`}
                  >
                    {step.icon}
                  </div>
                  <div className="pt-0.5">
                    <div className="text-[14.5px] font-semibold">{step.title}</div>
                    <div className="mono text-[12.5px] text-muted mt-0.5">{step.meta}</div>
                    {step.tag && (
                      <div className="inline-block mt-2 text-[11.5px] bg-white border border-line rounded-md px-2 py-0.5">
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
      <section className="py-10 border-t border-b border-line" id="integrations">
        <div className="max-w-[1160px] mx-auto px-8 flex items-center justify-between flex-wrap gap-6">
          <div className="text-[13px] text-muted font-medium">
            Connects directly to the tools your firm already runs on
          </div>
          <div className="flex gap-9 flex-wrap">
            {integrations.map((name) => (
              <div key={name} className="flex items-center gap-2 text-[14.5px] font-semibold">
                <span className="w-[7px] h-[7px] rounded-full bg-blue" />
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24" id="product">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="max-w-[600px] mb-14">
            <div className="text-[13px] font-semibold text-blue mb-3.5 uppercase tracking-wide">
              Product
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3.5">
              One inbox becomes one clear queue.
            </h2>
            <p className="text-base text-muted leading-relaxed">
              Stop forwarding emails and guessing who&rsquo;s covering what. PowerAI Law
              turns incoming client documents into assigned, trackable work the moment
              they land.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-card border border-line rounded-[20px] px-6.5 py-7.5 min-h-[210px] flex flex-col justify-between"
              >
                <div>
                  <div className="w-[38px] h-[38px] rounded-[10px] bg-white border border-line flex items-center justify-center text-base mb-4">
                    {f.icon}
                  </div>
                  <h3 className="text-[19px] font-semibold mb-2.5">{f.title}</h3>
                  <p className="text-[14.5px] text-muted leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="pb-24" id="how">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="max-w-[600px] mb-14">
            <div className="text-[13px] font-semibold text-blue mb-3.5 uppercase tracking-wide">
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
                <div className="mono text-[13px] text-blue mb-3.5">{s.num}</div>
                <h4 className="text-base font-semibold mb-2 font-display">{s.title}</h4>
                <p className="text-[13.5px] text-muted leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-24 bg-dark" id="pricing">
        <div className="max-w-[1160px] mx-auto px-8">
          <div className="max-w-[600px] mb-14">
            <div className="text-[13px] font-semibold text-[#7aa2ff] mb-3.5 uppercase tracking-wide">
              Pricing
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-3.5">
              One plan. Everything included.
            </h2>
            <p className="text-base text-[#a2a5ad] leading-relaxed">
              No per-seat pricing, no add-on tiers. Connect your whole team.
            </p>
          </div>
          <div className="bg-[#16171d] border border-[#24252c] rounded-3xl p-11 max-w-[460px] flex flex-col gap-6.5">
            <div>
              <div className="flex items-baseline gap-2.5">
                <div className="font-display text-5xl font-semibold text-white">$199</div>
                <div className="text-[#82858f] text-[15px]">/ month per firm</div>
              </div>
              <div className="text-[#a2a5ad] text-[14.5px] leading-relaxed mt-2.5">
                Billed monthly. Cancel anytime.
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {pricingItems.map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-[#d6d7dc] text-[14.5px]">
                  <span className="w-[18px] h-[18px] rounded-full bg-blue flex items-center justify-center flex-shrink-0 text-[11px] text-white">
                    ✓
                  </span>
                  {item}
                </div>
              ))}
            </div>
            <a
              href="#"
              className="bg-white text-ink py-3.5 rounded-full text-[15px] font-semibold text-center hover:bg-[#e7e8eb] transition-colors"
            >
              Start free trial
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t border-line">
        <div className="max-w-[1160px] mx-auto px-8 flex items-center justify-between flex-wrap gap-5">
          <Logo />
          <div className="flex gap-7 text-[13.5px] text-muted flex-wrap">
            <a href="#product" className="hover:text-ink transition-colors">Product</a>
            <a href="#integrations" className="hover:text-ink transition-colors">Integrations</a>
            <a href="#pricing" className="hover:text-ink transition-colors">Pricing</a>
            <a href="#" className="hover:text-ink transition-colors">Privacy</a>
            <a href="#" className="hover:text-ink transition-colors">Terms</a>
          </div>
          <div className="text-[13px] text-muted">© 2026 PowerAI Law</div>
        </div>
      </footer>
    </>
  );
}
