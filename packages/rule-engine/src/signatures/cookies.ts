/**
 * Versioned cookie knowledge base. Suggestions, never authoritative:
 * organization overrides always take priority (docs/COOKIE_CLASSIFICATION.md).
 */
import type { ClassificationSource, Confidence, CookieCategory, CookieOverride } from '@consenttrace/shared';

export const COOKIE_KB_VERSION = '2026.08.0';

export interface CookieSignature {
  pattern: RegExp;
  domainPattern?: RegExp;
  vendor: string;
  category: CookieCategory;
  confidence: Confidence;
  note?: string;
}

export const COOKIE_SIGNATURES: CookieSignature[] = [
  // Analytics
  { pattern: /^_ga(_[A-Z0-9]+)?$/, vendor: 'Google Analytics', category: 'analytics', confidence: 'high' },
  { pattern: /^_gid$/, vendor: 'Google Analytics', category: 'analytics', confidence: 'high' },
  { pattern: /^_gat(_.*)?$/, vendor: 'Google Analytics', category: 'analytics', confidence: 'high' },
  { pattern: /^_hj[A-Za-z]/, vendor: 'Hotjar', category: 'analytics', confidence: 'high' },
  { pattern: /^_clck$|^_clsk$/, vendor: 'Microsoft Clarity', category: 'analytics', confidence: 'high' },
  { pattern: /^amplitude_/, vendor: 'Amplitude', category: 'analytics', confidence: 'high' },
  { pattern: /^mp_.*_mixpanel$/, vendor: 'Mixpanel', category: 'analytics', confidence: 'high' },
  { pattern: /^ajs_anonymous_id$|^ajs_user_id$/, vendor: 'Segment', category: 'analytics', confidence: 'high' },
  { pattern: /^_pk_(id|ses)/, vendor: 'Matomo', category: 'analytics', confidence: 'high' },
  { pattern: /^hubspotutk$|^__hstc$|^__hssc$|^__hssrc$/, vendor: 'HubSpot', category: 'analytics', confidence: 'high' },
  // Advertising
  { pattern: /^_fbp$/, vendor: 'Meta Pixel', category: 'advertising', confidence: 'high' },
  { pattern: /^_fbc$/, vendor: 'Meta Pixel', category: 'advertising', confidence: 'high' },
  { pattern: /^fr$/, domainPattern: /facebook\.com$/, vendor: 'Meta', category: 'advertising', confidence: 'high' },
  { pattern: /^_gcl_(au|aw|dc|gb)$/, vendor: 'Google Ads', category: 'advertising', confidence: 'high' },
  { pattern: /^IDE$/, domainPattern: /doubleclick\.net$/, vendor: 'Google DoubleClick', category: 'advertising', confidence: 'high' },
  { pattern: /^NID$/, domainPattern: /google\.(com|[a-z.]+)$/, vendor: 'Google', category: 'advertising', confidence: 'medium' },
  { pattern: /^MUID$/, vendor: 'Microsoft Advertising', category: 'advertising', confidence: 'high' },
  { pattern: /^_uet(sid|vid)$/, vendor: 'Microsoft Advertising (UET)', category: 'advertising', confidence: 'high' },
  { pattern: /^_pin_unauth$/, vendor: 'Pinterest Ads', category: 'advertising', confidence: 'high' },
  { pattern: /^_ttp$|^_tt_enable_cookie$/, vendor: 'TikTok Pixel', category: 'advertising', confidence: 'high' },
  { pattern: /^li_fat_id$|^lidc$|^bcookie$/, vendor: 'LinkedIn', category: 'advertising', confidence: 'medium' },
  { pattern: /^_scid$/, vendor: 'Snap Pixel', category: 'advertising', confidence: 'high' },
  { pattern: /^cto_bundle$/, vendor: 'Criteo', category: 'advertising', confidence: 'high' },
  { pattern: /^_rdt_uuid$/, vendor: 'Reddit Ads', category: 'advertising', confidence: 'high' },
  // Functional
  { pattern: /^intercom-(id|session|device-id)-/, vendor: 'Intercom', category: 'functional', confidence: 'high' },
  { pattern: /^__zlcmid$/, vendor: 'Zendesk Chat', category: 'functional', confidence: 'high' },
  { pattern: /^wp-settings-/, vendor: 'WordPress', category: 'functional', confidence: 'medium' },
  // Strictly necessary (platform/session/security + consent-state storage)
  { pattern: /^(PHPSESSID|JSESSIONID|ASP\.NET_SessionId|connect\.sid|_session_id|session_id|sid)$/i, vendor: 'Platform session', category: 'strictly_necessary', confidence: 'medium' },
  { pattern: /^(csrf|xsrf|_csrf|csrftoken|XSRF-TOKEN|__RequestVerificationToken)/i, vendor: 'CSRF protection', category: 'strictly_necessary', confidence: 'high' },
  { pattern: /^__cf_bm$|^cf_clearance$/, vendor: 'Cloudflare', category: 'strictly_necessary', confidence: 'high', note: 'Bot management' },
  { pattern: /^__stripe_(mid|sid)$/, vendor: 'Stripe', category: 'strictly_necessary', confidence: 'medium', note: 'Fraud prevention' },
  { pattern: /^AWSALB(CORS)?$/, vendor: 'AWS load balancer', category: 'strictly_necessary', confidence: 'high' },
  { pattern: /^CookieConsent$/, vendor: 'Cookiebot', category: 'strictly_necessary', confidence: 'high', note: 'Stores consent state' },
  { pattern: /^Optanon(Consent|AlertBoxClosed)$/, vendor: 'OneTrust', category: 'strictly_necessary', confidence: 'high', note: 'Stores consent state' },
  { pattern: /^euconsent-v2$/, vendor: 'IAB TCF', category: 'strictly_necessary', confidence: 'high', note: 'Stores consent string' },
  { pattern: /^cookieyes-consent$/, vendor: 'CookieYes', category: 'strictly_necessary', confidence: 'high', note: 'Stores consent state' },
];

export interface CookieClassification {
  category: CookieCategory;
  source: ClassificationSource;
  vendor: string | null;
  confidence: Confidence | null;
}

/**
 * Classify a cookie. Priority: organization override → known signature → unclassified/unknown.
 * Never guesses: an unmatched cookie is `unknown`, not advertising.
 */
export function classifyCookie(name: string, domain: string, overrides: CookieOverride[] = []): CookieClassification {
  const cleanDomain = domain.replace(/^\./, '');
  for (const o of overrides) {
    const matched = o.isRegex ? new RegExp(o.pattern).test(name) : o.pattern === name;
    if (matched) {
      return { category: o.category, source: 'organization_override', vendor: o.vendor ?? null, confidence: 'high' };
    }
  }
  for (const sig of COOKIE_SIGNATURES) {
    if (!sig.pattern.test(name)) continue;
    if (sig.domainPattern && !sig.domainPattern.test(cleanDomain)) continue;
    return { category: sig.category, source: 'known_signature', vendor: sig.vendor, confidence: sig.confidence };
  }
  return { category: 'unknown', source: 'unclassified', vendor: null, confidence: null };
}
