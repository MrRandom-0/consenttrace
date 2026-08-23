/**
 * Typed facade over chrome.* APIs. Every capture call is gated on an explicit
 * per-origin permission granted at Quick Check time (optional_host_permissions)
 * — the extension holds NO default host access. Demo/preview contexts (no
 * chrome APIs) are detected so the UI can render without them.
 */

export function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.tabs && !!chrome.scripting && !!chrome.runtime?.id;
}

export function isSupportedUrl(url: string | undefined): url is string {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function originPattern(url: string): string {
  return new URL(url).origin + '/*';
}

/**
 * Debug/E2E hook: sidepanel.html?tabId=<id> pins the panel to a specific tab.
 * Only extension-privileged contexts can open panel URLs (sidepanel.html is not
 * web-accessible), and pinning grants nothing beyond the user's normal per-origin
 * permission flow — it only changes which tab the panel inspects.
 */
export function pinnedTabId(): number | null {
  try {
    const raw = new URLSearchParams(location.search).get('tabId');
    if (raw === null) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id >= 0 ? id : null;
  } catch {
    return null;
  }
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const pinned = pinnedTabId();
  if (pinned !== null) {
    try {
      return await chrome.tabs.get(pinned);
    } catch {
      return null;
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

export async function hasOriginPermission(url: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [originPattern(url)] });
}

/** Must be called from a user gesture (button click). */
export async function requestOriginPermission(url: string): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: [originPattern(url)] });
  } catch {
    return false;
  }
}

/** Privacy hygiene: let the user hand back a granted origin without visiting chrome://extensions. */
export async function revokeOriginPermission(url: string): Promise<boolean> {
  try {
    return await chrome.permissions.remove({ origins: [originPattern(url)] });
  } catch {
    return false;
  }
}

export async function execInTab<Result, Args extends unknown[]>(
  tabId: number,
  func: (...args: Args) => Result,
  args: Args,
): Promise<Result> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func,
    args,
  });
  const first = results[0];
  if (!first) throw new Error('script_no_result');
  return first.result as Result;
}

export interface RawCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
  session: boolean;
  expirationDate?: number;
}

/**
 * First-party cookie store for the page URL (includes HttpOnly). Third-party
 * cookies require host permission for those origins — a documented limitation;
 * third-party *requests* are still observed via resource timing.
 */
export async function getCookiesForUrl(url: string): Promise<RawCookie[]> {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: (c.sameSite as RawCookie['sameSite']) ?? 'unspecified',
    session: c.session,
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {}),
  }));
}

let lastCaptureAt = 0;
/** Viewport screenshot as a PNG data URL. Throttled (Chrome rate-limits captures). */
export async function captureVisible(windowId: number): Promise<string | null> {
  const since = Date.now() - lastCaptureAt;
  if (since < 600) await new Promise((r) => setTimeout(r, 600 - since));
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    lastCaptureAt = Date.now();
    return dataUrl;
  } catch {
    return null;
  }
}

export async function reloadTabAndWait(tabId: number, timeoutMs = 20000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(ok);
    };
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish(true);
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId).catch(() => finish(false));
    setTimeout(() => finish(false), timeoutMs);
  });
}

/** Notify when the active tab (or its URL) changes. Returns unsubscribe. */
export function onActiveTabChanged(callback: () => void): () => void {
  const onActivated = () => callback();
  const onUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) callback();
  };
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  return () => {
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
  };
}
