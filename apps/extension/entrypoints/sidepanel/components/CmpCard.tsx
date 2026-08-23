import { useState } from 'react';
import { Card, Chip, Meter } from './ui';
import type { QuickSession } from '../../../lib/types';
import type { ConsentActionType } from '@consenttrace/shared';

const ACTION_LABEL: Record<ConsentActionType, string> = {
  accept_all: 'accept',
  reject_all: 'reject',
  manage_preferences: 'manage',
  save_preferences: 'save',
  necessary_only: 'necessary only',
  close: 'close',
  withdraw: 'withdraw',
  unknown: 'unknown',
};

function actionTone(action: ConsentActionType): 'good' | 'bad' | 'accent' | 'neutral' {
  if (action === 'reject_all' || action === 'necessary_only') return 'good';
  if (action === 'accept_all') return 'bad';
  if (action === 'unknown') return 'neutral';
  return 'accent';
}

export function CmpCard({ session }: { session: QuickSession }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const cmp = session.cmp;
  if (!cmp) return null;
  return (
    <Card
      title="Consent interface"
      right={
        cmp.detected ? (
          <Chip tone={cmp.provider ? 'accent' : 'neutral'}>{cmp.provider ?? 'custom banner'}</Chip>
        ) : (
          <Chip>not detected</Chip>
        )
      }
    >
      {cmp.detected ? (
        <>
          <Meter value={cmp.confidence} label="Detection confidence" />
          {cmp.bannerText && (
            <p className="muted mt-2 line-clamp-2 text-[11.5px]" title={cmp.bannerText}>
              “{cmp.bannerText.slice(0, 160)}
              {cmp.bannerText.length > 160 ? '…' : ''}”
            </p>
          )}
          {session.candidates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {session.candidates.slice(0, 8).map((c) => (
                <span key={c.control.ctId} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1">
                  <span className="max-w-[120px] truncate text-[11.5px] font-medium" title={c.control.text}>
                    {c.control.text || c.control.ariaLabel || c.control.tag}
                  </span>
                  <Chip tone={actionTone(c.classification.action)}>{ACTION_LABEL[c.classification.action]}</Chip>
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            className="muted mt-2 cursor-pointer border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--accent)]"
            onClick={() => setShowEvidence((v) => !v)}
          >
            {showEvidence ? 'Hide detection evidence' : `Detection evidence (${cmp.evidence.length})`}
          </button>
          {showEvidence && (
            <ul className="mono muted mt-1 space-y-0.5 pl-3 text-[11px]">
              {cmp.evidence.map((e, i) => (
                <li key={i}>
                  {e.kind}: {e.detail}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="muted text-[12px]">
          No consent banner was detected on the current page state. It may have been dismissed already, appear only in
          certain regions, or the site may not use one.
        </p>
      )}
    </Card>
  );
}
