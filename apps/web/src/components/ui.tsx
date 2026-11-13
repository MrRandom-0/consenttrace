import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

export function Chip({ tone = 'neutral', children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return (
    <span className={`chip${tone !== 'neutral' ? ` chip-${tone}` : ''}`} title={title}>
      {children}
    </span>
  );
}

export function severityTone(severity: string): ChipTone {
  if (severity === 'critical' || severity === 'high') return 'bad';
  if (severity === 'medium' || severity === 'low') return 'warn';
  return 'neutral';
}

export function categoryTone(category: string): ChipTone {
  switch (category) {
    case 'advertising': return 'bad';
    case 'analytics': return 'warn';
    case 'functional':
    case 'cdn':
    case 'security': return 'accent';
    case 'strictly_necessary': return 'good';
    default: return 'neutral';
  }
}

export function statusTone(status: string): ChipTone {
  switch (status) {
    case 'completed': return 'good';
    case 'running':
    case 'queued': return 'accent';
    case 'failed': return 'bad';
    default: return 'neutral';
  }
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className ?? ''}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[12px] font-semibold tracking-wide text-[var(--muted)] uppercase">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: tone === 'bad' ? 'var(--bad)' : tone === 'good' ? 'var(--good)' : 'var(--accent)', opacity: tone ? 1 : 0.35 }}
      />
      <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">{label}</p>
      <p className={`mt-1 text-[26px] leading-none font-bold tracking-tight ${tone === 'bad' ? 'text-[var(--bad)]' : tone === 'good' ? 'text-[var(--good)]' : ''}`}>{value}</p>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 border-dashed p-10 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)]" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M4.5 13.5h4l2-4.5 3 7 2-4h4" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="muted max-w-md text-[13px]">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="pulse inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />;
}

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" />
      <path d="M4.5 13.5h4l2-4.5 3 7 2-4h4" stroke="var(--accent-ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Logo size={size} />
      <span className="font-bold tracking-tight" style={{ fontSize: size * 0.8 }}>
        Consent<span className="text-[var(--accent)]">Trace</span>
      </span>
    </span>
  );
}
