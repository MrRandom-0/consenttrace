import { SCANNER_VERSION, DISCLAIMER } from '@consenttrace/shared';
import { Btn } from './ui';
import type { Settings } from '../../../lib/settings';

export function SettingsSheet({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" aria-label="Close settings" className="flex-1 cursor-default border-none bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="flex w-[300px] flex-col gap-4 overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Settings</h2>
          <Btn variant="ghost" onClick={onClose}>
            Done
          </Btn>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-[var(--muted)]">Theme</span>
          <select
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12.5px]"
            value={settings.theme}
            onChange={(e) => onChange({ ...settings, theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-[var(--muted)]">Settle window after consent click (ms)</span>
          <input
            type="number"
            min={500}
            max={15000}
            step={500}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12.5px]"
            value={settings.settleMs}
            onChange={(e) => onChange({ ...settings, settleMs: Math.max(500, Math.min(15000, Number(e.target.value) || 3000)) })}
          />
          <span className="muted mt-1 block text-[10.5px]">How long to wait for tags to fire before capturing the after-state.</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-[var(--muted)]">ConsentTrace dashboard URL</span>
          <input
            type="url"
            placeholder="https://app.example.com (optional)"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12.5px]"
            value={settings.dashboardUrl}
            onChange={(e) => onChange({ ...settings, dashboardUrl: e.target.value })}
          />
          <span className="muted mt-1 block text-[10.5px]">
            Workspace sync (cloud scans, baselines, scheduled monitoring) arrives with the ConsentTrace web app.
          </span>
        </label>

        <div className="mt-auto space-y-2 border-t border-[var(--line)] pt-3">
          <p className="text-[11px] font-semibold">ConsentTrace extension v{SCANNER_VERSION}</p>
          <p className="muted text-[10.5px] leading-snug">
            All captures run locally in your browser and stay on your machine. Only test websites you own or are
            authorized to test.
          </p>
          <p className="muted text-[10.5px] leading-snug">{DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
