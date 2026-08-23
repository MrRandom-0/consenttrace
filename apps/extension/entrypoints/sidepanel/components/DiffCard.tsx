import { Card, Chip } from './ui';
import { diffPanelSnapshots, trackingSummary } from '../../../lib/evidence';
import type { PanelSnapshot, QuickSession } from '../../../lib/types';

function MatrixCell({ value, flag }: { value: string; flag: boolean }) {
  return <td className={`px-2 py-1 text-[11.5px] ${flag ? 'font-semibold text-[var(--bad)]' : 'text-[var(--good)]'}`}>{value}</td>;
}

export function DiffCard({ session }: { session: QuickSession }) {
  const baseline = session.snapshots.baseline;
  const after = session.snapshots.afterAction;
  if (!baseline || !after) return null;
  const diff = diffPanelSnapshots(baseline, after);
  const reload = session.snapshots.afterReload;

  const columns: Array<{ label: string; snapshot: PanelSnapshot }> = [
    { label: 'Baseline', snapshot: baseline },
    { label: session.action ? (session.action.kind === 'reject_all' ? 'After reject' : 'After accept') : 'After change', snapshot: after },
    ...(reload ? [{ label: 'After reload', snapshot: reload }] : []),
  ];
  const expectClean = session.action?.kind === 'reject_all';

  return (
    <Card title="What changed" right={session.action ? <Chip tone="accent">{session.action.mode}</Chip> : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[10.5px] font-semibold tracking-wide text-[var(--muted)] uppercase">Signal</th>
              {columns.map((c) => (
                <th key={c.label} className="px-2 py-1 text-left text-[10.5px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="row-line">
              <td className="px-2 py-1 text-[11.5px]">Tracking cookies</td>
              {columns.map((c) => {
                const n = trackingSummary(c.snapshot).cookieNames.length;
                return <MatrixCell key={c.label} value={n > 0 ? `Observed (${n})` : 'None observed'} flag={n > 0 && (expectClean || c.label === 'Baseline')} />;
              })}
            </tr>
            <tr className="row-line">
              <td className="px-2 py-1 text-[11.5px]">Tracking requests</td>
              {columns.map((c) => {
                const n = c.snapshot.resources.filter((r) => r.category === 'analytics' || r.category === 'advertising').length;
                return <MatrixCell key={c.label} value={n > 0 ? `Observed (${n})` : 'None observed'} flag={n > 0 && (expectClean || c.label === 'Baseline')} />;
              })}
            </tr>
            <tr>
              <td className="px-2 py-1 text-[11.5px]">Banner visible</td>
              {columns.map((c) => (
                <MatrixCell
                  key={c.label}
                  value={c.snapshot.bannerVisible === null ? '—' : c.snapshot.bannerVisible ? 'Yes' : 'No'}
                  flag={c.label === 'After reload' && c.snapshot.bannerVisible === true}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 space-y-1 border-t border-[var(--line)] pt-2">
        {diff.cookies.added.length > 0 && (
          <p className="text-[11.5px]">
            <span className="font-bold text-[var(--bad)]">+</span> New cookies:{' '}
            <span className="mono">{diff.cookies.added.map((c) => c.name).join(', ')}</span>
          </p>
        )}
        {diff.cookies.removed.length > 0 && (
          <p className="text-[11.5px]">
            <span className="font-bold text-[var(--good)]">−</span> Removed cookies:{' '}
            <span className="mono">{diff.cookies.removed.map((c) => c.name).join(', ')}</span>
          </p>
        )}
        {diff.newTrackingDomains.length > 0 && (
          <p className="text-[11.5px]">
            <span className="font-bold text-[var(--bad)]">+</span> New tracking domains:{' '}
            <span className="mono">{diff.newTrackingDomains.join(', ')}</span>
          </p>
        )}
        {diff.newStorageKeys.length > 0 && (
          <p className="text-[11.5px]">
            <span className="font-bold text-[var(--warn)]">~</span> New storage keys:{' '}
            <span className="mono">{diff.newStorageKeys.join(', ')}</span>
          </p>
        )}
        {diff.cookies.added.length === 0 && diff.cookies.removed.length === 0 && diff.newTrackingDomains.length === 0 && (
          <p className="muted text-[11.5px]">No meaningful cookie or tracking-domain changes since baseline.</p>
        )}
      </div>
    </Card>
  );
}
