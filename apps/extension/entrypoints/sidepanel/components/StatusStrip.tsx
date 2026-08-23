import { cx } from '../../../lib/format';
import type { QuickSession } from '../../../lib/types';

export function StatusStrip({ session }: { session: QuickSession }) {
  const findings = session.findings.filter((f) => f.status === 'finding').length;
  let tone: 'neutral' | 'busy' | 'good' | 'bad' = 'neutral';
  let text = "Ready — run a Quick Check to capture this page's consent state.";

  switch (session.status) {
    case 'unsupported':
      tone = 'neutral';
      text = "This page can't be inspected (browser or store pages). Open a regular website.";
      break;
    case 'need_gesture':
      tone = 'neutral';
      text = 'Open the panel via the ConsentTrace toolbar button to link it to the current tab.';
      break;
    case 'awaiting_permission':
      tone = 'busy';
      text = 'Waiting for site access — approve the permission prompt.';
      break;
    case 'inspecting':
      tone = 'busy';
      text = 'Inspecting page — cookies, storage, requests, consent UI…';
      break;
    case 'acting':
      tone = 'busy';
      text = 'Performing consent action and waiting for tags to settle…';
      break;
    case 'reloading':
      tone = 'busy';
      text = 'Reloading page to test consent persistence…';
      break;
    case 'error':
      tone = 'bad';
      text = `${session.error?.code ?? 'ERROR'} — ${session.error?.message ?? 'Something went wrong.'}`;
      break;
    case 'ready':
      if (findings > 0) {
        tone = 'bad';
        text = `${findings} potential issue${findings === 1 ? '' : 's'} observed during this check.`;
      } else if (session.snapshots.baseline) {
        tone = 'good';
        text = session.action
          ? 'No findings — consent behavior looked consistent during this check.'
          : 'Baseline captured — no findings so far. Test a consent action next.';
      }
      break;
    default:
      break;
  }

  return (
    <div
      role="status"
      className={cx(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] font-medium',
        tone === 'neutral' && 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]',
        tone === 'busy' && 'border-[var(--line)] bg-[var(--accent-soft)] text-[var(--accent)]',
        tone === 'good' && 'border-[color-mix(in_srgb,var(--good)_30%,transparent)] bg-[var(--good-soft)] text-[var(--good)]',
        tone === 'bad' && 'border-[color-mix(in_srgb,var(--bad)_30%,transparent)] bg-[var(--bad-soft)] text-[var(--bad)]',
      )}
    >
      <span
        className={cx('inline-block h-1.5 w-1.5 flex-none rounded-full', tone === 'busy' && 'pulse')}
        style={{ background: 'currentColor' }}
        aria-hidden="true"
      />
      <span className="min-w-0">{text}</span>
    </div>
  );
}
