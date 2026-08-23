import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * ConsentTrace Chrome extension (Manifest V3).
 *
 * Permission philosophy (docs/EXTENSION.md, docs/WEB_STORE.md):
 * - NO default host access. Host permission is requested per-origin at the
 *   moment the user starts a Quick Check (optional_host_permissions).
 * - activeTab covers reading the current tab when the user invokes the action.
 * - No webRequest, no tabs (browsing history), no <all_urls>.
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => {
    const testBuild = mode === 'test' || process.env.CT_EXT_TEST === '1';
    return {
    name: testBuild ? 'ConsentTrace (TEST BUILD)' : 'ConsentTrace — Consent QA & Evidence',
    short_name: 'ConsentTrace',
    description:
      'Inspect, record and compare cookie-consent behavior on websites you are authorized to test. Evidence stays in your browser.',
    version: '0.1.0',
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'cookies'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    // TEST MODE ONLY: pre-granted fixture hosts so E2E automation can bypass the
    // native permission prompt. Never present in production builds (E2E asserts this).
    ...(testBuild
      ? {
          host_permissions: [
            'http://site.fixture.test/*',
            'http://metrics.fxanalytics.example/*',
            'http://cdn.fxtracker.example/*',
            // Real tracker hostnames used by the E2E suite via --host-resolver-rules.
            'http://www.google-analytics.com/*',
            'http://connect.facebook.net/*',
          ],
        }
      : {}),
    action: { default_title: 'Open ConsentTrace' },
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@consenttrace/shared': r('../../packages/shared/src/index.ts'),
        '@consenttrace/scanner-core': r('../../packages/scanner-core/src/index.ts'),
        '@consenttrace/rule-engine': r('../../packages/rule-engine/src/index.ts'),
      },
    },
  }),
});
