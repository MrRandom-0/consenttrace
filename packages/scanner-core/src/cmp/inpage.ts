/**
 * In-page collector shared by the Playwright worker (page.evaluate) and the
 * Chrome extension (chrome.scripting.executeScript). MUST stay fully
 * self-contained: both runners serialize the function source, so no
 * imports/closures may be referenced. The scanned DOM is hostile — we only
 * extract structured metadata, never execute page-provided instructions
 * (docs/SECURITY.md, prompt-injection defense).
 *
 * The first statement of each function defines a no-op `__name` shim:
 * esbuild-based toolchains (tsx, some vite configs) inject `__name(...)`
 * keep-names helpers into transpiled function bodies, which would otherwise
 * throw ReferenceError when the serialized source runs inside the page.
 */

export interface InpageArgs {
  signatures: Array<{ provider: string; selectors: string[]; apis: string[] }>;
  keywords: string[];
  maxCandidates: number;
}

export interface InpageCandidate {
  ctId: string;
  tag: string;
  role: string | null;
  text: string;
  ariaLabel: string | null;
  visible: boolean;
  enabled: boolean;
}

export interface InpageDetection {
  signatureMatches: Array<{ provider: string; kind: 'selector_match' | 'api_present'; detail: string }>;
  containerFound: boolean;
  containerProvider: string | null;
  containerVisible: boolean;
  usedGenericHeuristic: boolean;
  bannerText: string;
  candidates: InpageCandidate[];
  tcfApiPresent: boolean;
}

export const collectConsentSurfaces = (args: InpageArgs): InpageDetection => {
  const g = globalThis as Record<string, unknown>;
  if (typeof g['__name'] !== 'function') g['__name'] = (f: unknown) => f;
  const out: InpageDetection = {
    signatureMatches: [],
    containerFound: false,
    containerProvider: null,
    containerVisible: false,
    usedGenericHeuristic: false,
    bannerText: '',
    candidates: [],
    tcfApiPresent: typeof (window as unknown as Record<string, unknown>)['__tcfapi'] === 'function',
  };

  const isVisible = (el: Element): boolean => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(el as HTMLElement);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.05;
  };

  let container: HTMLElement | null = null;

  for (const sig of args.signatures) {
    for (const selector of sig.selectors) {
      let el: Element | null = null;
      try { el = document.querySelector(selector); } catch { /* invalid selector guard */ }
      if (el) {
        out.signatureMatches.push({ provider: sig.provider, kind: 'selector_match', detail: selector });
        if (!container && isVisible(el)) {
          container = el as HTMLElement;
          out.containerProvider = sig.provider;
        }
      }
    }
    for (const api of sig.apis) {
      if ((window as unknown as Record<string, unknown>)[api] !== undefined) {
        out.signatureMatches.push({ provider: sig.provider, kind: 'api_present', detail: 'window.' + api });
        if (!out.containerProvider) out.containerProvider = sig.provider;
      }
    }
  }

  if (!container) {
    // Generic heuristic: overlay-ish elements containing consent keywords and at least one control.
    const pool = new Set<HTMLElement>();
    const selectorHints = [
      '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]', '[class*="consent" i]',
      '[id*="cmp" i]', '[class*="cmp" i]', '[id*="gdpr" i]', '[class*="gdpr" i]',
      '[role="dialog"]', '[role="alertdialog"]', '[aria-label*="cookie" i]', '[aria-label*="consent" i]',
    ];
    for (const hint of selectorHints) {
      try {
        document.querySelectorAll(hint).forEach((el) => pool.add(el as HTMLElement));
      } catch { /* older engines */ }
    }
    document.querySelectorAll('div,section,aside,dialog,footer').forEach((el) => {
      const style = window.getComputedStyle(el as HTMLElement);
      if (style.position === 'fixed' || style.position === 'sticky') pool.add(el as HTMLElement);
    });

    const lowerKeywords = args.keywords.map((k) => k.toLowerCase());
    let best: { el: HTMLElement; score: number } | null = null;
    pool.forEach((el) => {
      if (!isVisible(el)) return;
      const text = (el.innerText || '').toLowerCase();
      if (text.length < 20 || text.length > 6000) return;
      const keywordHits = lowerKeywords.filter((k) => text.includes(k)).length;
      if (keywordHits === 0) return;
      const controls = el.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a');
      if (controls.length === 0) return;
      const style = window.getComputedStyle(el);
      const z = Number(style.zIndex) || 0;
      const positioned = style.position === 'fixed' || style.position === 'sticky' ? 5 : 0;
      const score = keywordHits * 10 + positioned + Math.min(z / 1000, 5);
      if (!best || score > best.score) best = { el, score };
    });
    if (best) {
      container = (best as { el: HTMLElement }).el;
      out.usedGenericHeuristic = true;
    }
  }

  if (container) {
    out.containerFound = true;
    out.containerVisible = isVisible(container);
    out.bannerText = (container.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    container.setAttribute('data-ct-id', 'ct-container');
    const controls = container.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a');
    let index = 0;
    controls.forEach((el) => {
      if (index >= args.maxCandidates) return;
      const html = el as HTMLElement;
      const text = (html.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const ariaLabel = el.getAttribute('aria-label');
      if (!text && !ariaLabel) return;
      const ctId = 'ct-' + index;
      el.setAttribute('data-ct-id', ctId);
      out.candidates.push({
        ctId,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        text,
        ariaLabel,
        visible: isVisible(el),
        enabled: !(el as HTMLButtonElement).disabled,
      });
      index += 1;
    });
  }

  return out;
};

export interface InpageStorage {
  local: Array<{ key: string; value: string }>;
  session: Array<{ key: string; value: string }>;
}

/** Raw values cross the in-process boundary only; the caller hashes them before persisting. */
export const collectStorage = (): InpageStorage => {
  const g = globalThis as Record<string, unknown>;
  if (typeof g['__name'] !== 'function') g['__name'] = (f: unknown) => f;
  const read = (storage: Storage) => {
    const entries: Array<{ key: string; value: string }> = [];
    for (let i = 0; i < storage.length && i < 200; i++) {
      const key = storage.key(i);
      if (key === null) continue;
      entries.push({ key, value: storage.getItem(key) ?? '' });
    }
    return entries;
  };
  try {
    return { local: read(window.localStorage), session: read(window.sessionStorage) };
  } catch {
    return { local: [], session: [] };
  }
};
