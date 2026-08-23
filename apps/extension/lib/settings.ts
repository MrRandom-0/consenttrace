/** Panel settings persisted in chrome.storage.local (memory fallback for demo/preview). */
import { isExtensionContext } from './chromex';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  settleMs: number;
  dashboardUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  settleMs: 3000,
  dashboardUrl: '',
};

const KEY = 'ct_settings_v1';
let memory: Settings = { ...DEFAULT_SETTINGS };

export async function loadSettings(): Promise<Settings> {
  if (!isExtensionContext()) return memory;
  const stored = await chrome.storage.local.get(KEY);
  const raw = stored[KEY] as Partial<Settings> | undefined;
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return { ...merged, dashboardUrl: sanitizeDashboardUrl(merged.dashboardUrl) };
}

/** Only http(s) dashboard URLs are ever stored or opened — blocks javascript:/data: schemes. */
export function sanitizeDashboardUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  const sanitized: Settings = { ...next, dashboardUrl: sanitizeDashboardUrl(next.dashboardUrl) };
  memory = sanitized;
  if (!isExtensionContext()) return;
  await chrome.storage.local.set({ [KEY]: sanitized });
}

export function resolveTheme(theme: Settings['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.dataset['theme'] = resolveTheme(theme);
}
