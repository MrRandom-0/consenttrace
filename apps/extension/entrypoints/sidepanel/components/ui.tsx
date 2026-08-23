import type { ReactNode } from 'react';
import { cx } from '../../../lib/format';

export type ChipTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

export function Chip({ tone = 'neutral', children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return (
    <span className={cx('chip', tone !== 'neutral' && `chip-${tone}`)} title={title}>
      {children}
    </span>
  );
}

export function Btn({
  variant = 'subtle',
  disabled,
  onClick,
  children,
  title,
  full,
}: {
  variant?: 'primary' | 'subtle' | 'ghost' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('btn', `btn-${variant}`, full && 'w-full')}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  right,
  children,
  className,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('card p-3', className)}>
      {(title || right) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[12px] font-semibold tracking-wide text-[var(--muted)] uppercase">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'confidence'}>
      <div className="meter flex-1">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="mono muted">{pct}%</span>
    </div>
  );
}

export function Spinner() {
  return (
    <span className="pulse inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
  );
}

export function categoryTone(category: string): ChipTone {
  switch (category) {
    case 'advertising':
      return 'bad';
    case 'analytics':
      return 'warn';
    case 'functional':
    case 'cdn':
    case 'security':
      return 'accent';
    case 'strictly_necessary':
      return 'good';
    default:
      return 'neutral';
  }
}

export function severityTone(severity: string): ChipTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'bad';
    case 'medium':
      return 'warn';
    case 'low':
      return 'warn';
    default:
      return 'neutral';
  }
}
