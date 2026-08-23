/**
 * Deterministic CMP detection signatures. Detection never trusts a single selector:
 * the worker combines selector matches, window API presence and keyword heuristics
 * into a CMPDetection with confidence and evidence entries.
 */
export interface CmpSignature {
  provider: string;
  /** DOM selectors whose presence indicates this CMP. */
  selectors: string[];
  /** window globals whose presence indicates this CMP. */
  apis: string[];
}

export const CMP_SIGNATURES: CmpSignature[] = [
  { provider: 'Cookiebot', selectors: ['#CybotCookiebotDialog', '#CookiebotWidget'], apis: ['Cookiebot'] },
  { provider: 'OneTrust', selectors: ['#onetrust-banner-sdk', '#onetrust-consent-sdk'], apis: ['OneTrust', 'OnetrustActiveGroups'] },
  { provider: 'Didomi', selectors: ['#didomi-notice', '#didomi-host'], apis: ['Didomi'] },
  { provider: 'Usercentrics', selectors: ['#usercentrics-root', '#usercentrics-cmp-ui'], apis: ['UC_UI'] },
  { provider: 'Quantcast Choice', selectors: ['.qc-cmp2-container', '#qc-cmp2-container'], apis: [] },
  { provider: 'CookieYes', selectors: ['.cky-consent-container', '.cky-consent-bar'], apis: [] },
  { provider: 'Osano CookieConsent', selectors: ['.cc-window', '.osano-cm-window'], apis: [] },
  { provider: 'TrustArc', selectors: ['#truste-consent-track', '#consent_blackbar'], apis: ['truste'] },
  { provider: 'Complianz', selectors: ['#cmplz-cookiebanner-container', '.cmplz-cookiebanner'], apis: [] },
  { provider: 'Axeptio', selectors: ['#axeptio_overlay'], apis: ['axeptio'] },
  { provider: 'Klaro', selectors: ['.klaro .cookie-notice', '#klaro'], apis: ['klaro'] },
  { provider: 'Termly', selectors: ['#termly-code-snippet-support'], apis: [] },
  { provider: 'Iubenda', selectors: ['#iubenda-cs-banner'], apis: ['_iub'] },
];

/** IAB TCF presence is CMP-agnostic evidence that a CMP framework exists. */
export const TCF_API_NAME = '__tcfapi';

/** Multi-language keywords indicating consent UI in generic (unknown CMP) detection. */
export const GENERIC_CONSENT_KEYWORDS = [
  'cookie', 'cookies', 'consent', 'tracking', 'gdpr', 'privacy preferences', 'we use',
  'consentement', 'einwilligung', 'akzeptieren', 'datenschutz', 'zustimmen',
  'consentimiento', 'consenso', 'toestemming', 'zgoda', 'samtykke', 'suostumus',
];
