import { describe, expect, it } from 'vitest';
import { collectConsentSurfaces, collectStorage } from '@consenttrace/scanner-core';
import { buildExportHtml, buildExportJson, exportBaseName } from '../lib/export';
import { captureResources, clickByCtId } from '../lib/inject';
import { buildDemoSession } from '../lib/demo';

describe('export', () => {
  it('JSON export is parseable, hashed, disclaimed, and value-free', async () => {
    const session = buildDemoSession();
    const json = JSON.parse(await buildExportJson(session));
    expect(json.product).toBe('ConsentTrace Extension');
    expect(json.disclaimer).toContain('does not provide legal advice');
    expect(Object.keys(json.artifactHashes)).toContain('cookies_baseline');
    expect(json.artifactHashes.cookies_baseline).toMatch(/^[a-f0-9]{64}$/);
    const flat = JSON.stringify(json.snapshots);
    expect(flat).not.toMatch(/"value"\s*:/); // hashed values only
  });
  it('HTML export embeds findings and the disclaimer without legal claims', async () => {
    const session = buildDemoSession();
    const html = await buildExportHtml(session);
    expect(html).toContain('ConsentTrace');
    expect(html).toContain('CT-002');
    expect(html).toContain('does not provide legal advice');
    expect(html).not.toMatch(/GDPR compliant|non-compliant|illegal/i);
  });
  it('export filename is sanitized', () => {
    const session = buildDemoSession();
    expect(exportBaseName(session)).toMatch(/^consenttrace_demo-shop\.example_\d{4}-\d{2}-\d{2}T/);
  });
});

describe('injected functions stay self-contained', () => {
  it('serialized sources carry the __name shim and no module references', () => {
    for (const fn of [collectConsentSurfaces, collectStorage, captureResources, clickByCtId]) {
      const src = String(fn);
      expect(src).toContain('__name');
      expect(src).not.toContain('CMP_SIGNATURES');
      expect(src).not.toContain('require(');
      expect(src).not.toMatch(/\bimport\(/);
    }
  });
});
