/**
 * REAL-BROWSER extension E2E: loads the built MV3 extension into full Chromium
 * (new headless) and drives the side panel UI against local consent fixtures.
 *
 * Test build (`wxt build --mode test`) pre-grants fixture host permissions so
 * chrome.permissions.request resolves without a native prompt; the suite also
 * asserts the production manifest carries NO host_permissions. The panel is
 * pinned to the fixture tab via the ?tabId= debug hook.
 */
import { execSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServers, type FixtureServers } from '../../fixtures/src/server';

const EXT_DIR = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(EXT_DIR, '.output/chrome-mv3');
const SITE_PORT = 4310;
const TRACKER_PORT = 4311;
const SITE_URL = `http://site.fixture.test:${SITE_PORT}/site`;
// Real tracker hostnames (resolved to localhost) so the extension's PRODUCTION
// domain knowledge base classifies them — no test-only overrides in the panel.
const ANALYTICS_HOST = 'www.google-analytics.com';
const ADS_HOST = 'connect.facebook.net';
const HOST_RULES = `MAP site.fixture.test 127.0.0.1, MAP ${ANALYTICS_HOST} 127.0.0.1, MAP ${ADS_HOST} 127.0.0.1`;

let servers: FixtureServers;
let context: BrowserContext;
let serviceWorker: Worker;
let extensionId: string;

async function tabIdForUrl(urlPrefix: string): Promise<number> {
  const tabId = await serviceWorker.evaluate(async (prefix: string) => {
    const tabs = await chrome.tabs.query({});
    // Last match = the tab this flow just opened (earlier flows may linger).
    const matching = tabs.filter((t) => t.url?.startsWith(prefix));
    return matching.at(-1)?.id ?? -1;
  }, urlPrefix);
  expect(tabId).toBeGreaterThan(-1);
  return tabId;
}

/** Open a fixture tab in `mode` with clean per-origin storage, plus a pinned panel. */
async function openFlow(mode: string): Promise<{ site: Page; panel: Page }> {
  // Isolate flows: close pages from previous flows so tab lookup stays unambiguous.
  for (const page of context.pages()) await page.close().catch(() => {});
  servers.setMode(mode as never);
  const site = await context.newPage();
  await site.goto(SITE_URL, { waitUntil: 'load' });
  await site.evaluate(() => localStorage.clear());
  await site.reload({ waitUntil: 'load' });
  const tabId = await tabIdForUrl(`http://site.fixture.test:${SITE_PORT}`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`, { waitUntil: 'load' });
  await panel.getByText('site.fixture.test', { exact: false }).first().waitFor({ timeout: 10000 });
  return { site, panel };
}

beforeAll(async () => {
  execSync('npx wxt build', { cwd: EXT_DIR, stdio: 'pipe', env: { ...process.env, CT_EXT_TEST: '1' } });
  const manifest = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'));
  expect(manifest.name).toContain('TEST BUILD'); // never ship this build
  servers = await startFixtureServers({
    sitePort: SITE_PORT,
    trackerPort: TRACKER_PORT,
    analyticsHost: ANALYTICS_HOST,
    adsHost: ADS_HOST,
  });
  const profile = await mkdtemp(join(tmpdir(), 'ct-ext-profile-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, `--host-resolver-rules=${HOST_RULES}`],
  });
  serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  extensionId = new URL(serviceWorker.url()).hostname;
}, 180000);

afterAll(async () => {
  await context?.close();
  await servers?.close();
});

describe('quick check on a well-behaved site', () => {
  let panel: Page;

  it('captures a baseline: banner detected, controls classified, no findings', async () => {
    ({ panel } = await openFlow('clean'));
    await panel.getByRole('button', { name: 'Run Quick Check' }).click();
    await panel.getByText('Baseline captured', { exact: false }).waitFor({ timeout: 20000 });

    await expect.poll(() => panel.locator('.chip', { hasText: 'custom banner' }).count()).toBeGreaterThan(0);
    expect(await panel.getByText('Reject all', { exact: true }).count()).toBeGreaterThan(0);
    expect(await panel.locator('.chip', { hasText: 'no findings' }).count()).toBe(1);
    expect(await panel.locator('.chip', { hasText: 'access granted' }).count()).toBe(1);
    // Observed state shows the always-present necessary session cookie.
    expect(await panel.getByText('session_id').count()).toBeGreaterThan(0);
  }, 60000);

  it('guided reject stays clean and persistence check passes', async () => {
    await panel.getByRole('button', { name: 'Test Reject' }).click();
    await panel.getByText('What changed', { exact: false }).waitFor({ timeout: 30000 });
    expect(await panel.getByText(/Clicked “Reject all”/).count()).toBeGreaterThan(0);
    expect(await panel.locator('.chip', { hasText: 'no findings' }).count()).toBe(1);

    await panel.getByRole('button', { name: 'Check persistence' }).click();
    await panel.getByText('preference persisted', { exact: false }).first().waitFor({ timeout: 30000 });
    expect(await panel.getByText('Banner shown again').count()).toBe(0);
  }, 90000);

  it('exports hashed, value-free JSON evidence locally', async () => {
    const downloadPromise = panel.waitForEvent('download', { timeout: 20000 });
    await panel.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const exported = JSON.parse(await readFile(path!, 'utf8'));
    expect(exported.product).toBe('ConsentTrace Extension');
    expect(exported.artifactHashes.cookies_baseline).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.disclaimer).toContain('does not provide legal advice');
    expect(JSON.stringify(exported.snapshots)).not.toMatch(/"value"\s*:/); // hashes only
    expect(JSON.stringify(exported.snapshots)).toContain('sha256:');
  }, 60000);
});

describe('quick check on a leaky site (pre-consent tracking)', () => {
  it('fires CT-001 with the offending cookies named', async () => {
    const { panel } = await openFlow('pre_consent_tracking');
    await panel.getByRole('button', { name: 'Run Quick Check' }).click();
    await panel.getByText('CT-001', { exact: false }).first().waitFor({ timeout: 20000 });
    expect(await panel.getByText('HIGH').count()).toBeGreaterThan(0);
    expect(await panel.getByText(/_fbp/).count()).toBeGreaterThan(0);
    expect(await panel.getByText(/potential issues? observed/i).count()).toBe(1);
  }, 60000);
});

describe('reject ignored by tags', () => {
  it('fires CT-002 and CT-003 after the guided reject', async () => {
    const { panel } = await openFlow('reject_ignored');
    await panel.getByRole('button', { name: 'Run Quick Check' }).click();
    await panel.getByRole('button', { name: 'Test Reject' }).click({ timeout: 20000 });
    await panel.getByText('CT-002', { exact: false }).first().waitFor({ timeout: 30000 });
    expect(await panel.getByText('CT-003', { exact: false }).count()).toBeGreaterThan(0);
  }, 90000);
});

describe('production build security posture', () => {
  it('prod manifest has no pre-granted hosts, no web-accessible panel, minimal permissions', async () => {
    execSync('npx wxt build', { cwd: EXT_DIR, stdio: 'pipe' }); // restore + verify prod output
    const manifest = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'));
    expect(manifest.name).not.toContain('TEST');
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest.permissions.sort()).toEqual(['activeTab', 'cookies', 'scripting', 'sidePanel', 'storage']);
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.content_security_policy).toBeUndefined(); // MV3 default CSP (no relaxation)
  });
});
