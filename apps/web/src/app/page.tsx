import Link from 'next/link';
import { PLANS } from '@/server/entitlements';
import { Logo } from '@/components/ui';

const DISCLAIMER =
  'ConsentTrace provides automated technical observations about website consent behavior. Results depend on the tested configuration, location, browser environment and scan timing. ConsentTrace does not provide legal advice or certify regulatory compliance.';

function MatrixDemo() {
  const rows = [
    { label: 'Necessary cookies', cells: ['Observed (1)', 'Observed (2)', 'Observed (2)'], tones: ['n', 'n', 'n'] },
    { label: 'Analytics cookies', cells: ['None observed', 'None observed', 'Observed (2)'], tones: ['g', 'g', 'n'] },
    { label: 'Advertising cookies', cells: ['None observed', 'None observed', 'Observed (1)'], tones: ['g', 'g', 'n'] },
    { label: 'Advertising requests', cells: ['None observed', 'None observed', 'Observed (2)'], tones: ['g', 'g', 'n'] },
    { label: 'Preference persisted', cells: ['—', 'Persisted', 'Persisted'], tones: ['n', 'g', 'g'] },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-white/10 text-left text-[11px] tracking-wider text-white/50 uppercase">
            <th className="px-4 py-2.5 font-medium">Signal</th>
            <th className="px-4 py-2.5 font-medium">No action</th>
            <th className="px-4 py-2.5 font-medium">Reject all</th>
            <th className="px-4 py-2.5 font-medium">Accept all</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-2.5 text-white/80">{row.label}</td>
              {row.cells.map((cell, i) => (
                <td key={i} className={`px-4 py-2.5 ${row.tones[i] === 'g' ? 'text-emerald-400' : 'text-white/60'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FEATURES = [
  {
    title: 'Consent-state scenarios',
    body: 'Every scan runs no-action, Reject All and Accept All in isolated browser contexts — plus reloads that verify the choice actually persists.',
  },
  {
    title: 'Deterministic rules, versioned',
    body: 'Twelve technical rules (CT-001…CT-012) interpret the evidence. Same evidence, same result — AI can explain, never decide.',
  },
  {
    title: 'Tamper-evident evidence',
    body: 'Screenshots, cookie snapshots, network timelines and consent actions — every artifact SHA-256 hashed and sealed in a manifest.',
  },
  {
    title: 'Regression detection',
    body: 'Pin a baseline. When a deployment makes _fbp appear before the banner, you get the rule, the timing, and the evidence trail.',
  },
  {
    title: 'Client-ready reports',
    body: 'Consent matrix, findings, methodology, limitations and hashes in a report your client can open — and your engineer can trust.',
  },
  {
    title: 'Browser extension',
    body: 'Quick Check any page you are authorized to test, straight from a side panel. Same detection engine, evidence stays local.',
  },
];

const STEPS = [
  { n: '1', title: 'Add a site you are authorized to test', body: 'Ownership confirmation up front; domain verification for volume.' },
  { n: '2', title: 'Baseline the consent behavior', body: 'Clean-context scans capture what each consent state actually does.' },
  { n: '3', title: 'Monitor on a schedule', body: 'Daily or weekly re-tests compare against your pinned baseline.' },
  { n: '4', title: 'Ship the evidence', body: 'Regression alerts with timelines, diffs, screenshots and hashes.' },
];

export default function LandingPage() {
  const plans = Object.values(PLANS);
  return (
    <div className="bg-[#0a0d13] text-white" style={{ colorScheme: 'dark' }}>
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="inline-flex items-center gap-2">
          <Logo size={22} />
          <span className="text-[16px] font-bold tracking-tight">
            Consent<span className="text-[#6b9dff]">Trace</span>
          </span>
        </span>
        <nav className="flex items-center gap-2">
          <a href="#features" className="btn btn-ghost !text-white/70 hover:!text-white">Features</a>
          <a href="#pricing" className="btn btn-ghost !text-white/70 hover:!text-white">Pricing</a>
          <Link href="/login" className="btn btn-ghost !text-white/70 hover:!text-white">Sign in</Link>
          <Link href="/register" className="btn !bg-white !text-[#0a0d13] hover:!bg-white/90">Get started</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-2">
        <div>
          <p className="mb-4 inline-flex rounded-full border border-white/15 px-3 py-1 text-[12px] font-semibold text-white/60">
            Cookie consent testing with evidence
          </p>
          <h1 className="text-[44px] leading-[1.05] font-bold tracking-tight">
            Test consent.
            <br />
            Detect regressions.
            <br />
            <span className="text-[#6b9dff]">Prove what happened.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-white/60">
            A cookie scanner tells you 47 cookies exist. ConsentTrace tells you that yesterday&apos;s deployment made{' '}
            <span className="mono text-white/80">_fbp</span> appear <em>before</em> anyone clicked the banner — with the
            request timeline, screenshots and hashed evidence to back it up.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="btn !bg-[#155eef] !px-5 !py-2.5 !text-[14px] !text-white hover:!bg-[#1a6bff]">
              Start testing free
            </Link>
            <a href="#how" className="btn btn-subtle !border-white/20 !bg-transparent !px-5 !py-2.5 !text-[14px] !text-white/80 hover:!bg-white/5">
              How it works
            </a>
          </div>
          <p className="mt-5 text-[12px] text-white/40">
            For agencies, privacy consultants, compliance and QA teams. Only test sites you are authorized to test.
          </p>
        </div>

        {/* Evidence card mock (real product data shape) */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] font-semibold tracking-wider text-white/50 uppercase">Regression detected</span>
            <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-0.5 text-[11px] font-bold text-red-400">
              HIGH · CT-010
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-white/80">
            Baseline scan observed <span className="text-emerald-400">no tracking before consent</span>; this scan observed{' '}
            <span className="mono text-red-300">3 tracking cookies</span> [_ga, _gid, _fbp] and{' '}
            <span className="mono text-red-300">2 tracking requests</span> before any consent choice.
          </p>
          <div className="mono mt-4 space-y-1.5 rounded-lg bg-black/30 p-3 text-[11.5px] text-white/50">
            <p>00:01.483 <span className="text-white/75">Consent banner detected (custom)</span></p>
            <p>00:01.721 <span className="text-white/75">Cookie snapshot captured</span></p>
            <p className="text-red-300">00:01.910 Cookie _fbp observed (advertising, Meta Pixel)</p>
            <p className="text-red-300">00:02.143 Request → cdn.tracker.example (advertising)</p>
            <p>00:05.992 <span className="text-white/75">Evidence manifest sealed · sha256 efe22c91…</span></p>
          </div>
          <div className="mt-4">
            <MatrixDemo />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-[26px] font-bold tracking-tight">Repeatable consent QA, not one-off scans</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n}>
                <span className="mono text-[13px] font-bold text-[#6b9dff]">{step.n}</span>
                <h3 className="mt-1 text-[15px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-white/50">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-[26px] font-bold tracking-tight">Built for evidence, end to end</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-[14.5px] font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product visuals */}
      <section className="border-t border-white/5 bg-white/[0.015]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-[26px] font-bold tracking-tight">From dashboard to side panel</h2>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/55">
              Scheduled cloud scans watch your portfolio from clean browser contexts. The Chrome extension brings the same
              detection engine to any page you&apos;re debugging — banner classification, hashed snapshots, exportable
              evidence, all local.
            </p>
            <div className="mono mt-6 rounded-lg border border-white/10 bg-black/40 p-4 text-[12px] leading-relaxed text-white/60">
              <p className="text-white/35"># CI gate — deterministic rules only</p>
              <p>$ consenttrace scan https://staging.example.com \</p>
              <p className="pl-4">--baseline baselines/prod.json --fail-on high</p>
              <p className="mt-2 text-red-300">[HIGH] [REGRESSION] CT-010 — tracking before consent</p>
              <p className="text-white/35">exit code 2 → deployment blocked</p>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/media/panel-dark.png"
            alt="ConsentTrace Chrome extension side panel showing consent findings"
            className="mx-auto w-full max-w-[360px] rounded-2xl border border-white/10 shadow-2xl"
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-[26px] font-bold tracking-tight">Pricing that scales with your portfolio</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-5 ${plan.id === 'agency' ? 'border-[#155eef] bg-[#155eef]/10' : 'border-white/10 bg-white/[0.02]'}`}
            >
              {plan.id === 'agency' && <p className="mb-2 text-[10.5px] font-bold tracking-wider text-[#6b9dff] uppercase">Most popular</p>}
              <h3 className="text-[15px] font-semibold">{plan.label}</h3>
              <p className="mt-1 text-[24px] font-bold">
                {plan.priceMonthlyUsd === null ? 'Custom' : plan.priceMonthlyUsd === 0 ? '$0' : `$${plan.priceMonthlyUsd}`}
                {plan.priceMonthlyUsd ? <span className="text-[12px] font-medium text-white/40">/mo</span> : null}
              </p>
              <p className="mt-1 text-[12.5px] text-white/50">{plan.blurb}</p>
              <ul className="mt-4 space-y-1.5 text-[12.5px] text-white/60">
                <li>{plan.entitlements.maxSites} site{plan.entitlements.maxSites === 1 ? '' : 's'}</li>
                <li>{plan.entitlements.maxMonthlyScans.toLocaleString()} scans / month</li>
                <li>{plan.entitlements.scheduledScans ? 'Scheduled monitoring' : 'Manual scans'}</li>
                <li>{plan.entitlements.evidenceRetentionDays}-day evidence retention</li>
                <li>{plan.entitlements.brandedReports ? 'Branded client reports' : 'Standard reports'}</li>
              </ul>
              <Link href="/register" className="btn mt-5 w-full !border-white/20 !bg-white/5 !text-white hover:!bg-white/10">
                {plan.priceMonthlyUsd === null ? 'Talk to us' : 'Get started'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-[28px] font-bold tracking-tight">Your consent banner changed last Tuesday. Would you know?</h2>
          <p className="mt-3 text-[14.5px] text-white/55">Baseline it today. The next regression sends you the evidence.</p>
          <Link href="/register" className="btn mt-6 !bg-[#155eef] !px-6 !py-3 !text-[14.5px] !text-white hover:!bg-[#1a6bff]">
            Start testing free
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <p className="max-w-3xl text-[11.5px] leading-relaxed text-white/35">{DISCLAIMER}</p>
        <p className="mt-3 text-[11.5px] text-white/25">© 2026 ConsentTrace.</p>
      </footer>
    </div>
  );
}
