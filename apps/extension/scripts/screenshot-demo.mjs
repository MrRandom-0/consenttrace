/**
 * Renders the built side panel in demo mode (?demo=1) and captures light/dark
 * screenshots — used for design review and Chrome Web Store listing assets.
 * Requires: npm run -w @consenttrace/extension build
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const file = join(DIST, path === '/' ? 'sidepanel.html' : path);
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(4400, '127.0.0.1', resolve));

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 400, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4400/sidepanel.html?demo=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const out = join(dirname(fileURLToPath(import.meta.url)), `../store/sidepanel-demo-${scheme}.png`);
  await page.screenshot({ path: out });
  console.log('wrote', out);
  await context.close();
}
await browser.close();
server.close();
