import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvidenceRecorder, sha256Hex, valueHash, verifyManifest } from '@consenttrace/evidence';

describe('hashing', () => {
  it('valueHash is deterministic, prefixed and never the raw value', () => {
    const h = valueHash('super-secret-cookie-value');
    expect(h).toMatch(/^sha256:[a-f0-9]{24}$/);
    expect(h).toBe(valueHash('super-secret-cookie-value'));
    expect(h).not.toContain('super-secret');
  });
});

describe('EvidenceRecorder', () => {
  it('stores artifacts with correct hashes and a verifiable manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ct-evidence-'));
    const recorder = new EvidenceRecorder(dir, 'scan_test1');
    const item = await recorder.addArtifact({
      relPath: 'no_action/screenshot-initial.png',
      type: 'screenshot',
      scenario: 'no_action',
      label: 'Initial page',
      data: Buffer.from('fake-png-bytes'),
    });
    expect(item.sha256).toBe(sha256Hex(Buffer.from('fake-png-bytes')));
    await recorder.addJsonArtifact({
      relPath: 'no_action/cookies-after_settle.json',
      type: 'cookie_snapshot',
      scenario: 'no_action',
      label: 'Cookies',
      json: [{ name: '_ga' }],
    });
    recorder.addEvent({ scenario: 'no_action', atMs: 10, at: new Date().toISOString(), type: 'context_created', description: 'x' });

    const manifest = await recorder.finalize();
    expect(manifest.artifacts.length).toBe(3); // 2 artifacts + timeline
    expect(manifest.manifestSha256).toMatch(/^[a-f0-9]{64}$/);

    const verification = await verifyManifest(dir);
    expect(verification.ok).toBe(true);

    // Tamper with an artifact → verification must fail.
    await writeFile(join(dir, 'no_action/cookies-after_settle.json'), '[{"name":"_tampered"}]');
    const tampered = await verifyManifest(dir);
    expect(tampered.ok).toBe(false);
    expect(tampered.mismatches).toContain('no_action/cookies-after_settle.json');

    const timeline = JSON.parse(await readFile(join(dir, 'timeline.json'), 'utf8'));
    expect(timeline[0].type).toBe('context_created');
  });
});
