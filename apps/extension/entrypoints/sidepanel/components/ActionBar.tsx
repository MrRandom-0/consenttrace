import { Btn } from './ui';
import type { QuickSession } from '../../../lib/types';

export interface ActionHandlers {
  onQuickCheck: () => void;
  onReject: () => void;
  onAccept: () => void;
  onCaptureChanges: () => void;
  onPersistence: () => void;
  onReset: () => void;
}

export function ActionBar({ session, handlers }: { session: QuickSession; handlers: ActionHandlers }) {
  const busy = ['awaiting_permission', 'inspecting', 'acting', 'reloading'].includes(session.status);
  const disabled = busy || session.demo || session.status === 'unsupported' || session.status === 'need_gesture';
  const hasBaseline = !!session.snapshots.baseline;
  const bannerActive = !!session.cmp?.detected && session.snapshots.baseline?.bannerVisible === true && !session.action;
  const canReject = bannerActive && session.candidates.some((c) => c.classification.action === 'reject_all');
  const canAccept = bannerActive && session.candidates.some((c) => c.classification.action === 'accept_all');

  if (!hasBaseline) {
    return (
      <div className="flex gap-2">
        <Btn variant="primary" full disabled={disabled} onClick={handlers.onQuickCheck} title="Grant access for this site and capture the current consent state">
          {busy ? 'Working…' : 'Run Quick Check'}
        </Btn>
      </div>
    );
  }

  // Demo sessions showcase results; capture controls stay hidden.
  if (session.demo) return null;

  const onlyReset = !canReject && !canAccept && !!session.action && !!session.snapshots.afterReload;
  if (onlyReset) {
    return (
      <div className="flex gap-2">
        <Btn variant="subtle" full disabled={busy} onClick={handlers.onReset} title="Clear this session and start a new check on this page">
          Start new check
        </Btn>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canReject && (
        <Btn variant="primary" disabled={disabled} onClick={handlers.onReject} title="Click the detected reject control and capture what changes">
          Test Reject
        </Btn>
      )}
      {canAccept && (
        <Btn variant="subtle" disabled={disabled} onClick={handlers.onAccept} title="Click the detected accept control and capture what changes">
          Test Accept
        </Btn>
      )}
      {!session.action && (
        <Btn variant="subtle" disabled={disabled} onClick={handlers.onCaptureChanges} title="You interact with the banner yourself, then capture the changes">
          Capture changes
        </Btn>
      )}
      {session.action && !session.snapshots.afterReload && (
        <Btn variant="subtle" disabled={disabled} onClick={handlers.onPersistence} title="Reload the page and verify the choice persists">
          Check persistence
        </Btn>
      )}
      <Btn variant="ghost" disabled={busy || session.demo} onClick={handlers.onReset} title="Start over on this page">
        Reset
      </Btn>
    </div>
  );
}
