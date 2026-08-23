import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getActiveTab,
  hasOriginPermission,
  isExtensionContext,
  isSupportedUrl,
  onActiveTabChanged,
  pinnedTabId,
  revokeOriginPermission,
} from '../../lib/chromex';
import { buildDemoSession } from '../../lib/demo';
import { captureChanges, checkPersistence, performGuidedAction, runQuickCheck } from '../../lib/orchestrator';
import { freshSession, sessionReducer, type SessionMsg } from '../../lib/session';
import { applyTheme, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../lib/settings';
import type { QuickSession } from '../../lib/types';
import { ActionBar } from './components/ActionBar';
import { CmpCard } from './components/CmpCard';
import { DataTabs } from './components/DataTabs';
import { DiffCard } from './components/DiffCard';
import { ExportBar } from './components/ExportBar';
import { FindingsCard } from './components/FindingsCard';
import { Header } from './components/Header';
import { PageCard } from './components/PageCard';
import { SettingsSheet } from './components/SettingsSheet';
import { StatusStrip } from './components/StatusStrip';
import { Timeline } from './components/Timeline';
import { Card } from './components/ui';
import { fmtMs } from '../../lib/format';

function useSession() {
  const ref = useRef<QuickSession>(freshSession());
  const [session, setSession] = useState<QuickSession>(ref.current);
  const dispatch = useCallback((msg: SessionMsg) => {
    ref.current = sessionReducer(ref.current, msg);
    setSession(ref.current);
  }, []);
  const replace = useCallback((next: QuickSession) => {
    ref.current = next;
    setSession(next);
  }, []);
  const getSession = useCallback(() => ref.current, []);
  return { session, dispatch, replace, getSession };
}

function IntroCard() {
  return (
    <Card title="Quick check">
      <ul className="space-y-1.5 text-[12px]">
        <li className="flex gap-2">
          <span className="font-bold text-[var(--accent)]">1</span>
          Detects the consent banner and classifies its controls (accept / reject / settings).
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-[var(--accent)]">2</span>
          Snapshots cookies, storage and third-party requests — values hashed, nothing leaves this browser.
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-[var(--accent)]">3</span>
          Test a consent action, verify persistence, and export client-ready evidence.
        </li>
      </ul>
      <p className="muted mt-2 text-[10.5px]">Only test websites you own or are authorized to test.</p>
    </Card>
  );
}

function ScreenshotStrip({ session }: { session: QuickSession }) {
  if (session.screenshots.length === 0) return null;
  return (
    <Card title="Screenshots" right={<span className="mono muted">{session.screenshots.length}</span>}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {session.screenshots.map((shot, i) => (
          <figure key={i} className="m-0 w-[128px] flex-none">
            <img
              src={shot.dataUrl}
              alt={shot.label}
              className="h-[80px] w-[128px] rounded-lg border border-[var(--line)] object-cover object-top"
            />
            <figcaption className="muted mt-1 truncate text-[10px]" title={`${shot.label} · +${fmtMs(shot.atMs)}`}>
              {shot.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}

export function App() {
  const { session, dispatch, replace, getSession } = useSession();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const initFromActiveTab = useCallback(async () => {
    const demoRequested = new URLSearchParams(location.search).get('demo') === '1';
    if (demoRequested || !isExtensionContext()) {
      replace(buildDemoSession());
      return;
    }
    const tab = await getActiveTab();
    if (!tab || tab.id === undefined) {
      dispatch({ kind: 'INIT', tabId: -1, windowId: -1, url: '', title: '', supported: false });
      return;
    }
    if (!isSupportedUrl(tab.url)) {
      // Either an unsupported scheme, or no activeTab grant yet (url invisible).
      dispatch({ kind: 'INIT', tabId: tab.id, windowId: tab.windowId ?? -1, url: tab.url ?? '', title: tab.title ?? '', supported: false });
      if (!tab.url) dispatch({ kind: 'STATUS', status: 'need_gesture' });
      return;
    }
    const preGranted = await hasOriginPermission(tab.url);
    dispatch({
      kind: 'INIT',
      tabId: tab.id,
      windowId: tab.windowId ?? -1,
      url: tab.url,
      title: tab.title ?? '',
      supported: true,
      preGranted,
    });
  }, [dispatch, replace]);

  useEffect(() => {
    loadSettings().then((loaded) => {
      setSettings(loaded);
      applyTheme(loaded.theme);
    });
    void initFromActiveTab();
    if (!isExtensionContext()) return;
    // A pinned panel (debug/E2E ?tabId=) inspects exactly one tab — tab-switch
    // tracking would re-initialize onto the wrong tab, so it is disabled.
    if (pinnedTabId() !== null) return;
    const unsubscribe = onActiveTabChanged(() => {
      const current = getSession();
      if (['acting', 'reloading', 'inspecting', 'awaiting_permission'].includes(current.status)) return;
      void (async () => {
        const tab = await getActiveTab();
        if (!tab) return;
        const sameTab = tab.id === current.tabId;
        const sameOrigin = (() => {
          try {
            return isSupportedUrl(tab.url) && new URL(tab.url).origin === current.origin;
          } catch {
            return false;
          }
        })();
        if (sameTab && sameOrigin) return; // same page/session (e.g. our own reload)
        void initFromActiveTab();
      })();
    });
    return unsubscribe;
  }, [dispatch, getSession, initFromActiveTab, replace]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    applyTheme(next.theme);
    void saveSettings(next);
  };
  const cycleTheme = () => {
    const order: Settings['theme'][] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(settings.theme) + 1) % order.length]!;
    updateSettings({ ...settings, theme: next });
  };

  const busy = ['awaiting_permission', 'inspecting', 'acting', 'reloading'].includes(session.status);
  const hasBaseline = !!session.snapshots.baseline;

  return (
    <div className="flex h-screen flex-col">
      <Header
        session={session}
        busy={busy}
        onOpenSettings={() => setSettingsOpen(true)}
        onCycleTheme={cycleTheme}
        themeLabel={settings.theme}
      />
      <main className="flex-1 space-y-2.5 overflow-y-auto p-3">
        <StatusStrip session={session} />
        {session.origin && (
          <PageCard
            session={session}
            onRevoke={
              session.permissionGranted && !session.demo
                ? () => {
                    void revokeOriginPermission(session.url).then(() => dispatch({ kind: 'RESET' }));
                  }
                : undefined
            }
          />
        )}
        <ActionBar
          session={session}
          handlers={{
            onQuickCheck: () => void runQuickCheck(dispatch, getSession),
            onReject: () => void performGuidedAction(dispatch, getSession, 'reject_all', settings.settleMs),
            onAccept: () => void performGuidedAction(dispatch, getSession, 'accept_all', settings.settleMs),
            onCaptureChanges: () => void captureChanges(dispatch, getSession),
            onPersistence: () => void checkPersistence(dispatch, getSession, settings.settleMs),
            onReset: () => dispatch({ kind: 'RESET' }),
          }}
        />
        {!hasBaseline && session.status !== 'unsupported' && <IntroCard />}
        {hasBaseline && <CmpCard session={session} />}
        <FindingsCard session={session} />
        <DiffCard session={session} />
        {hasBaseline && <DataTabs session={session} />}
        <ScreenshotStrip session={session} />
        <Timeline session={session} />
      </main>
      <ExportBar session={session} dashboardUrl={settings.dashboardUrl} />
      {settingsOpen && <SettingsSheet settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
