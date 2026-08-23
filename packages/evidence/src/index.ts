/**
 * Evidence system: artifact storage with SHA-256 hashes, per-scenario timelines,
 * and a hashed manifest. Tamper-evident artifact hashes — not marketed as
 * legally certified evidence (docs/EVIDENCE_MODEL.md).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceItem, EvidenceManifest, EvidenceType, ScenarioType, TimelineEvent } from '@consenttrace/shared';
import { SCANNER_VERSION } from '@consenttrace/shared';

export function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Short, prefixed value hash for cookies/storage. Raw values are never persisted. */
export function valueHash(raw: string): string {
  return 'sha256:' + sha256Hex(raw).slice(0, 24);
}

export class EvidenceRecorder {
  private artifacts: EvidenceItem[] = [];
  private events: TimelineEvent[] = [];

  constructor(
    public readonly outDir: string,
    public readonly scanId: string,
  ) {}

  /** Persist an artifact (JSON or binary), hash it, and register it in the manifest. */
  async addArtifact(opts: {
    relPath: string;
    type: EvidenceType;
    scenario: ScenarioType | null;
    label: string;
    data: Buffer | string;
  }): Promise<EvidenceItem> {
    const absolute = join(this.outDir, opts.relPath);
    await mkdir(dirname(absolute), { recursive: true });
    const buffer = typeof opts.data === 'string' ? Buffer.from(opts.data, 'utf8') : Buffer.from(opts.data);
    await writeFile(absolute, buffer);
    const item: EvidenceItem = {
      id: 'ev_' + randomUUID().replace(/-/g, '').slice(0, 16),
      scenario: opts.scenario,
      type: opts.type,
      artifactPath: opts.relPath,
      sha256: sha256Hex(buffer),
      bytes: buffer.byteLength,
      createdAt: new Date().toISOString(),
      label: opts.label,
    };
    this.artifacts.push(item);
    return item;
  }

  async addJsonArtifact(opts: {
    relPath: string;
    type: EvidenceType;
    scenario: ScenarioType | null;
    label: string;
    json: unknown;
  }): Promise<EvidenceItem> {
    return this.addArtifact({ ...opts, data: JSON.stringify(opts.json, null, 2) });
  }

  addEvent(event: TimelineEvent): void {
    this.events.push(event);
  }

  getEvents(scenario?: ScenarioType): TimelineEvent[] {
    const events = scenario ? this.events.filter((e) => e.scenario === scenario) : [...this.events];
    return events.sort((a, b) => (a.scenario === b.scenario ? a.atMs - b.atMs : a.scenario.localeCompare(b.scenario)));
  }

  /** Write timeline + manifest and return the hashed manifest. */
  async finalize(): Promise<EvidenceManifest> {
    const timelineItem = await this.addJsonArtifact({
      relPath: 'timeline.json',
      type: 'consent_timeline',
      scenario: null,
      label: 'Combined evidence timeline',
      json: this.getEvents(),
    });
    void timelineItem;
    const artifacts = [...this.artifacts].sort((a, b) => a.artifactPath.localeCompare(b.artifactPath));
    const manifestSha256 = sha256Hex(JSON.stringify(artifacts));
    const manifest: EvidenceManifest = {
      scanId: this.scanId,
      scannerVersion: SCANNER_VERSION,
      createdAt: new Date().toISOString(),
      artifacts,
      manifestSha256,
    };
    await writeFile(join(this.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  }
}

/** Verify a manifest against artifacts on disk. Returns mismatched paths. */
export async function verifyManifest(outDir: string): Promise<{ ok: boolean; mismatches: string[] }> {
  const manifest: EvidenceManifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'));
  const mismatches: string[] = [];
  for (const item of manifest.artifacts) {
    try {
      const data = await readFile(join(outDir, item.artifactPath));
      if (sha256Hex(data) !== item.sha256) mismatches.push(item.artifactPath);
    } catch {
      mismatches.push(item.artifactPath + ' (missing)');
    }
  }
  const expected = sha256Hex(JSON.stringify(manifest.artifacts));
  if (expected !== manifest.manifestSha256) mismatches.push('manifest.json (manifest hash mismatch)');
  return { ok: mismatches.length === 0, mismatches };
}
