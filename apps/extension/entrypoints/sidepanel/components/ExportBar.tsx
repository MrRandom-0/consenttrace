import { useState } from 'react';
import { Btn } from './ui';
import { buildExportHtml, buildExportJson, downloadText, exportBaseName } from '../../../lib/export';
import type { QuickSession } from '../../../lib/types';

export function ExportBar({ session, dashboardUrl }: { session: QuickSession; dashboardUrl: string }) {
  const [busy, setBusy] = useState(false);
  if (!session.snapshots.baseline) return null;

  const exportAs = async (format: 'json' | 'html') => {
    setBusy(true);
    try {
      const base = exportBaseName(session);
      if (format === 'json') downloadText(`${base}.json`, await buildExportJson(session), 'application/json');
      else downloadText(`${base}.html`, await buildExportHtml(session), 'text/html');
    } finally {
      setBusy(false);
    }
  };

  return (
    <footer className="sticky bottom-0 z-20 border-t border-[var(--line)] bg-[var(--bg)]/95 p-2 backdrop-blur">
      <div className="flex gap-2">
        <Btn variant="subtle" full disabled={busy} onClick={() => void exportAs('html')} title="Self-contained HTML evidence report — stays on your machine">
          Export report
        </Btn>
        <Btn variant="subtle" full disabled={busy} onClick={() => void exportAs('json')} title="Machine-readable JSON evidence — stays on your machine">
          Export JSON
        </Btn>
        {/^https?:\/\//.test(dashboardUrl) && (
          <Btn variant="ghost" onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')} title="Open your ConsentTrace dashboard">
            Dashboard ↗
          </Btn>
        )}
      </div>
    </footer>
  );
}
