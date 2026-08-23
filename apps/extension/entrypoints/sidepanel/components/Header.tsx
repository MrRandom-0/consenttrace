import { Spinner } from './ui';
import type { QuickSession } from '../../../lib/types';

function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" />
      <path
        d="M4.5 13.5h4l2-4.5 3 7 2-4h4"
        stroke="var(--accent-ink)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Header({
  session,
  busy,
  onOpenSettings,
  onCycleTheme,
  themeLabel,
}: {
  session: QuickSession;
  busy: boolean;
  onOpenSettings: () => void;
  onCycleTheme: () => void;
  themeLabel: string;
}) {
  const findingCount = session.findings.filter((f) => f.status === 'finding').length;
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Logo />
        <div className="flex items-baseline gap-1">
          <span className="text-[13.5px] font-bold tracking-tight">
            Consent<span className="text-[var(--accent)]">Trace</span>
          </span>
          {session.demo && <span className="chip chip-accent ml-1">DEMO</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {busy && <Spinner />}
          {findingCount > 0 && (
            <span className="chip chip-bad" title={`${findingCount} finding(s) in this check`}>
              {findingCount} finding{findingCount === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            className="btn btn-ghost px-2"
            onClick={onCycleTheme}
            title={`Theme: ${themeLabel} — click to change`}
            aria-label={`Theme: ${themeLabel}. Activate to change theme`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          <button type="button" className="btn btn-ghost px-2" onClick={onOpenSettings} title="Settings" aria-label="Open settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
