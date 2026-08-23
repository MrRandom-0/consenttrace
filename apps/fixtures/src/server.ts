/**
 * Local consent-fixture websites for deterministic scanner testing.
 * Never depend on real external websites for automated test stability.
 *
 * Two servers:
 *  - site server (SITE_PORT): serves the fixture page; behavior is mode-switchable
 *    so the SAME URL can "regress" like a real deployment.
 *  - tracker server (TRACKER_PORT): plays fake third-party analytics + advertising hosts.
 *
 * The worker maps these hostnames to 127.0.0.1 via Chromium host-resolver-rules,
 * giving genuinely third-party request behavior without external DNS:
 *  - http://site.fixture.test:4300         (the scanned site)
 *  - http://metrics.fxanalytics.example:4301  (fake analytics endpoint)
 *  - http://cdn.fxtracker.example:4301        (fake advertising endpoint)
 */
import { createServer, type Server } from 'node:http';

export const SITE_PORT = 4300;
export const TRACKER_PORT = 4301;
export const SITE_HOST = 'site.fixture.test';
export const ANALYTICS_HOST = 'metrics.fxanalytics.example';
export const ADS_HOST = 'cdn.fxtracker.example';

export type FixtureMode = 'clean' | 'pre_consent_tracking' | 'reject_ignored' | 'no_reject' | 'no_banner';
let currentMode: FixtureMode = 'clean';

const GIF_1PX = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export interface TrackerHosts {
  trackerPort: number;
  analyticsHost: string;
  adsHost: string;
}

function pageHtml(mode: FixtureMode, hosts: TrackerHosts): string {
  const analyticsBase = `http://${hosts.analyticsHost}:${hosts.trackerPort}`;
  const adsBase = `http://${hosts.adsHost}:${hosts.trackerPort}`;
  const banner =
    mode === 'no_banner'
      ? ''
      : `
  <div id="fx-consent-banner" role="dialog" aria-label="Cookie consent" style="position:fixed;bottom:0;left:0;right:0;background:#101828;color:#f2f4f7;padding:20px 28px;display:none;z-index:9999;box-shadow:0 -4px 24px rgba(0,0,0,.25);font-size:14px;">
    <div style="max-width:960px;margin:0 auto;display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
      <p style="flex:1;min-width:260px;margin:0;line-height:1.5;">We use cookies to improve your experience, analyse traffic and show personalised advertising. You can accept all cookies, reject non-essential cookies, or manage your preferences.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="fx-settings" style="background:transparent;border:1px solid #475467;color:#f2f4f7;border-radius:8px;padding:10px 16px;cursor:pointer;">Cookie settings</button>
        ${mode === 'no_reject' ? '<button id="fx-close" style="background:transparent;border:1px solid #475467;color:#f2f4f7;border-radius:8px;padding:10px 16px;cursor:pointer;">Close</button>' : '<button id="fx-reject" style="background:#344054;border:none;color:#fff;border-radius:8px;padding:10px 16px;cursor:pointer;">Reject all</button>'}
        <button id="fx-accept" style="background:#155eef;border:none;color:#fff;border-radius:8px;padding:10px 16px;cursor:pointer;">Accept all</button>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Northwind Outfitters — Gear for every trail</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;color:#101828;background:#fff}
  header{padding:18px 32px;border-bottom:1px solid #eaecf0;display:flex;justify-content:space-between;align-items:center}
  .logo{font-weight:700;font-size:18px}
  nav a{color:#475467;text-decoration:none;margin-left:20px;font-size:14px}
  .hero{padding:72px 32px;max-width:960px;margin:0 auto}
  .hero h1{font-size:40px;margin:0 0 16px}
  .hero p{color:#475467;font-size:17px;line-height:1.6;max-width:560px}
  .cta{display:inline-block;margin-top:24px;background:#101828;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:960px;margin:24px auto 80px;padding:0 32px}
  .card{border:1px solid #eaecf0;border-radius:12px;padding:20px}
  .card h3{margin:0 0 8px;font-size:16px}
  .card p{color:#475467;font-size:14px;margin:0}
</style>
</head>
<body>
<header><div class="logo">Northwind Outfitters</div><nav><a href="#">Shop</a><a href="#">Journal</a><a href="#">About</a></nav></header>
<main>
  <section class="hero">
    <h1>Gear for every trail.</h1>
    <p>Technical apparel and equipment tested in the field. Free carbon-neutral shipping on orders over £75.</p>
    <a class="cta" href="#">Browse the collection</a>
  </section>
  <section class="cards">
    <div class="card"><h3>Alpine Series</h3><p>Lightweight shells built for fast ascents in bad weather.</p></div>
    <div class="card"><h3>Trail Essentials</h3><p>Packs, poles and layers for long days out.</p></div>
    <div class="card"><h3>Basecamp</h3><p>Everything you need when the day ends.</p></div>
  </section>
</main>
${banner}
<script>
(function () {
  var MODE = ${JSON.stringify(mode)};
  var ANALYTICS = ${JSON.stringify(analyticsBase)};
  var ADS = ${JSON.stringify(adsBase)};

  function setCookie(name, value, maxAge) {
    document.cookie = name + '=' + value + '; path=/; max-age=' + (maxAge || 63072000);
  }
  function fire(url) { var img = new Image(); img.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'cb=' + Date.now(); }
  function loadAnalytics() {
    setCookie('_ga', 'GA1.1.' + Math.floor(Math.random() * 1e9) + '.' + Math.floor(Date.now() / 1000));
    setCookie('_gid', 'GA1.1.' + Math.floor(Math.random() * 1e9));
    fire(ANALYTICS + '/collect?v=2&tid=FX-1');
  }
  function loadAds() {
    setCookie('_fbp', 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e9));
    fire(ADS + '/pixel.gif?id=FX-PIXEL');
  }
  function loadAllTracking() { loadAnalytics(); loadAds(); }

  // Always-present first-party state: session + a functional preference.
  setCookie('session_id', 'fx-' + Math.random().toString(36).slice(2));
  try { localStorage.setItem('fx_app_theme', 'light'); } catch (e) {}

  var banner = document.getElementById('fx-consent-banner');
  var consent = null;
  try { consent = localStorage.getItem('fx_consent'); } catch (e) {}

  if (MODE === 'pre_consent_tracking') {
    // BUG UNDER TEST: tags fire before any consent choice.
    loadAllTracking();
  }

  if (consent === 'accepted') {
    loadAllTracking();
  } else if (consent === 'rejected') {
    if (MODE === 'reject_ignored') loadAllTracking(); // BUG UNDER TEST: rejection ignored on later loads too.
  } else if (banner) {
    banner.style.display = 'block';
  }

  function choose(value) {
    try { localStorage.setItem('fx_consent', value); } catch (e) {}
    setCookie('fx_consent_state', value);
    if (banner) banner.style.display = 'none';
  }
  var accept = document.getElementById('fx-accept');
  if (accept) accept.addEventListener('click', function () { choose('accepted'); loadAllTracking(); });
  var reject = document.getElementById('fx-reject');
  if (reject) reject.addEventListener('click', function () {
    choose('rejected');
    if (MODE === 'reject_ignored') loadAllTracking(); // BUG UNDER TEST: reject click still fires tags.
  });
  var closeBtn = document.getElementById('fx-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { if (banner) banner.style.display = 'none'; });
  var settings = document.getElementById('fx-settings');
  if (settings) settings.addEventListener('click', function () { /* preference center arrives with Fixture 5 */ });
})();
</script>
</body>
</html>`;
}

const FIXED_ROUTES: Record<string, FixtureMode> = {
  '/fixtures/clean': 'clean',
  '/fixtures/pre-consent-tracking': 'pre_consent_tracking',
  '/fixtures/reject-ignored': 'reject_ignored',
  '/fixtures/no-reject': 'no_reject',
  '/fixtures/no-banner': 'no_banner',
};

export function createSiteServer(hosts: Partial<TrackerHosts> = {}): Server {
  const resolved: TrackerHosts = {
    trackerPort: hosts.trackerPort ?? TRACKER_PORT,
    analyticsHost: hosts.analyticsHost ?? ANALYTICS_HOST,
    adsHost: hosts.adsHost ?? ADS_HOST,
  };
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__fixture/set') {
      const mode = url.searchParams.get('mode') as FixtureMode | null;
      if (mode && ['clean', 'pre_consent_tracking', 'reject_ignored', 'no_reject', 'no_banner'].includes(mode)) {
        currentMode = mode;
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ mode: currentMode }));
      } else {
        res.writeHead(400).end('invalid mode');
      }
      return;
    }
    if (url.pathname === '/__fixture/mode') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ mode: currentMode }));
      return;
    }
    const fixedMode = FIXED_ROUTES[url.pathname];
    if (url.pathname === '/site' || url.pathname === '/' || fixedMode) {
      res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        .end(pageHtml(fixedMode ?? currentMode, resolved));
      return;
    }
    res.writeHead(404).end('not found');
  });
}

export function createTrackerServer(): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/pixel.gif') {
      res
        .writeHead(200, {
          'content-type': 'image/gif',
          'cache-control': 'no-store',
          'set-cookie': '_fx3p=1; Path=/; Max-Age=3600; SameSite=None',
        })
        .end(GIF_1PX);
      return;
    }
    if (url.pathname === '/collect') {
      res.writeHead(204, { 'cache-control': 'no-store' }).end();
      return;
    }
    res.writeHead(404).end('not found');
  });
}

export interface FixtureServers {
  site: Server;
  tracker: Server;
  sitePort: number;
  trackerPort: number;
  setMode(mode: FixtureMode): void;
  close(): Promise<void>;
}

/** Ports and tracker hostnames are configurable so suites can test both the
 * organization-override path (fixture domains) and the production knowledge
 * base path (real tracker domains resolved to localhost). */
export async function startFixtureServers(
  opts: { sitePort?: number; trackerPort?: number; analyticsHost?: string; adsHost?: string } = {},
): Promise<FixtureServers> {
  const sitePort = opts.sitePort ?? SITE_PORT;
  const trackerPort = opts.trackerPort ?? TRACKER_PORT;
  const site = createSiteServer({ trackerPort, ...(opts.analyticsHost ? { analyticsHost: opts.analyticsHost } : {}), ...(opts.adsHost ? { adsHost: opts.adsHost } : {}) });
  const tracker = createTrackerServer();
  await new Promise<void>((resolve) => site.listen(sitePort, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => tracker.listen(trackerPort, '127.0.0.1', resolve));
  return {
    sitePort,
    trackerPort,
    site,
    tracker,
    setMode(mode) {
      currentMode = mode;
    },
    close: async () => {
      await Promise.all([
        new Promise<void>((resolve) => site.close(() => resolve())),
        new Promise<void>((resolve) => tracker.close(() => resolve())),
      ]);
    },
  };
}

// Standalone: `npm run fixtures`
if (process.argv[1]?.endsWith('server.ts')) {
  startFixtureServers().then(() => {
    console.log(`Fixture site:    http://${SITE_HOST}:${SITE_PORT}/site (mode switchable via /__fixture/set?mode=...)`);
    console.log(`Fixed fixtures:  ${Object.keys(FIXED_ROUTES).join(', ')}`);
    console.log(`Tracker hosts:   ${ANALYTICS_HOST}, ${ADS_HOST} → 127.0.0.1:${TRACKER_PORT}`);
  });
}
