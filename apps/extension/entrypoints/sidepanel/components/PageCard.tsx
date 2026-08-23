import { Card, Chip } from './ui';
import { timeAgo } from '../../../lib/format';
import type { QuickSession } from '../../../lib/types';

export function PageCard({ session, onRevoke }: { session: QuickSession; onRevoke?: (() => void) | undefined }) {
  const host = session.origin.replace(/^https?:\/\//, '');
  const delta = session.history?.delta;
  const deltaBits: string[] = [];
  if (delta) {
    if (delta.newTrackingCookies.length) deltaBits.push(`+${delta.newTrackingCookies.length} tracking cookie(s)`);
    if (delta.newTrackingDomains.length) deltaBits.push(`+${delta.newTrackingDomains.length} tracking domain(s)`);
    if (delta.removedTrackingCookies.length) deltaBits.push(`−${delta.removedTrackingCookies.length} tracking cookie(s)`);
  }
  return (
    <Card title="Current page">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mono truncate text-[12.5px] font-semibold" title={session.url}>
            {host || '—'}
          </p>
          {session.title && <p className="muted mt-0.5 truncate text-[12px]">{session.title}</p>}
        </div>
        <span className="flex flex-none items-center gap-1">
          <Chip tone={session.permissionGranted ? 'good' : 'neutral'}>
            {session.permissionGranted ? 'access granted' : 'no access yet'}
          </Chip>
          {onRevoke && (
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[10.5px] font-semibold text-[var(--muted)] underline decoration-dotted hover:text-[var(--bad)]"
              onClick={onRevoke}
              title="Remove this site's permission and clear the session"
            >
              revoke
            </button>
          )}
        </span>
      </div>
      {session.history && (
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <p className="muted text-[11.5px]">
            vs last check ({timeAgo(session.history.previous.atEpoch)}):{' '}
            {deltaBits.length ? (
              <span className="font-semibold text-[var(--bad)]">{deltaBits.join(' · ')}</span>
            ) : (
              <span className="font-semibold text-[var(--good)]">no tracking changes</span>
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
