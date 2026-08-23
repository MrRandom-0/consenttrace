import { useState } from 'react';
import { Card, Chip, severityTone } from './ui';
import type { QuickSession } from '../../../lib/types';

export function FindingsCard({ session }: { session: QuickSession }) {
  const [showPasses, setShowPasses] = useState(false);
  const findings = session.findings.filter((f) => f.status === 'finding');
  const passes = session.findings.filter((f) => f.status === 'pass');
  if (session.findings.length === 0 && session.observations.length === 0) return null;

  return (
    <Card
      title="Deterministic checks"
      right={
        findings.length === 0 ? <Chip tone="good">no findings</Chip> : <Chip tone="bad">{findings.length} finding(s)</Chip>
      }
    >
      <div className="space-y-2">
        {findings.map((f, i) => (
          <div key={`${f.ruleId}-${i}`} className="rounded-lg border border-[var(--line)] border-l-2 border-l-[var(--bad)] bg-[var(--surface)] p-2.5">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Chip tone={severityTone(f.severity)}>{f.severity.toUpperCase()}</Chip>
              {f.regression && <Chip tone="bad">REGRESSION</Chip>}
              <span className="text-[12px] font-semibold">
                {f.ruleId} · {f.name}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed">{f.observation}</p>
          </div>
        ))}
        {session.observations.map((o, i) => (
          <div key={`obs-${i}`} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2.5">
            <div className="mb-1">
              <Chip tone="warn">OBSERVATION</Chip>
            </div>
            <p className="muted text-[12px] leading-relaxed">{o}</p>
          </div>
        ))}
        {passes.length > 0 && (
          <div>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--accent)]"
              onClick={() => setShowPasses((v) => !v)}
            >
              {showPasses ? 'Hide passed checks' : `Passed checks (${passes.length})`}
            </button>
            {showPasses && (
              <ul className="mt-1.5 space-y-1">
                {passes.map((p, i) => (
                  <li key={`${p.ruleId}-${i}`} className="muted flex gap-1.5 text-[11.5px]">
                    <span className="font-bold text-[var(--good)]">✓ {p.ruleId}</span>
                    <span>{p.observation}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <p className="muted mt-2 text-[10.5px] leading-snug">
        Technical observations from this browser session — not legal conclusions.
      </p>
    </Card>
  );
}
