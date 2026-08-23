import { useEffect, useRef } from 'react';
import { Card } from './ui';
import { cx, fmtMs } from '../../../lib/format';
import type { QuickSession } from '../../../lib/types';

function dotClass(type: string): string {
  if (type === 'error' || type === 'tracking_request' || type.includes('not_found')) return 'tl-dot-bad';
  if (type === 'consent_action' || type === 'banner_detected' || type === 'screenshot') return 'tl-dot-accent';
  if (type === 'permission_granted' || type === 'persistence_check' || type === 'rules_evaluated') return 'tl-dot-good';
  return '';
}

export function Timeline({ session }: { session: QuickSession }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(0);
  const count = session.timeline.length;
  useEffect(() => {
    // Follow the live log as events stream in, but never jump on initial mount
    // (e.g. opening the panel onto a restored or demo session).
    if (previousCount.current > 0 && count > previousCount.current) {
      endRef.current?.scrollIntoView({ block: 'nearest' });
    }
    previousCount.current = count;
  }, [count]);
  if (count === 0) return null;

  return (
    <Card title="Live timeline" right={<span className="mono muted">{count} events</span>}>
      <div className="tl-rail max-h-56 space-y-2 overflow-y-auto pr-1" role="log" aria-label="Session event timeline">
        {session.timeline.map((event, i) => (
          <div key={i} className="flex gap-2.5 pl-0.5">
            <span className={cx('tl-dot', dotClass(event.type))} aria-hidden="true" />
            <div className="min-w-0">
              <span className="mono muted mr-2">{fmtMs(event.atMs)}</span>
              <span className="text-[12px] leading-snug">{event.description}</span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Card>
  );
}
