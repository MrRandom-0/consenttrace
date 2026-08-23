/** Versioned request-domain knowledge base. Organization overrides take priority. */
import { matchesDomainSuffix } from '@consenttrace/shared';
import type { DomainOverride, RequestCategory } from '@consenttrace/shared';

export const DOMAIN_KB_VERSION = '2026.08.0';

export interface DomainSignature {
  suffix: string;
  vendor: string;
  category: RequestCategory;
}

export const DOMAIN_SIGNATURES: DomainSignature[] = [
  // Analytics
  { suffix: 'google-analytics.com', vendor: 'Google Analytics', category: 'analytics' },
  { suffix: 'analytics.google.com', vendor: 'Google Analytics', category: 'analytics' },
  { suffix: 'hotjar.com', vendor: 'Hotjar', category: 'analytics' },
  { suffix: 'hotjar.io', vendor: 'Hotjar', category: 'analytics' },
  { suffix: 'clarity.ms', vendor: 'Microsoft Clarity', category: 'analytics' },
  { suffix: 'mixpanel.com', vendor: 'Mixpanel', category: 'analytics' },
  { suffix: 'amplitude.com', vendor: 'Amplitude', category: 'analytics' },
  { suffix: 'segment.com', vendor: 'Segment', category: 'analytics' },
  { suffix: 'segment.io', vendor: 'Segment', category: 'analytics' },
  { suffix: 'plausible.io', vendor: 'Plausible', category: 'analytics' },
  { suffix: 'matomo.cloud', vendor: 'Matomo', category: 'analytics' },
  { suffix: 'fullstory.com', vendor: 'FullStory', category: 'analytics' },
  { suffix: 'mouseflow.com', vendor: 'Mouseflow', category: 'analytics' },
  { suffix: 'stats.wp.com', vendor: 'Jetpack Stats', category: 'analytics' },
  // Advertising
  { suffix: 'doubleclick.net', vendor: 'Google DoubleClick', category: 'advertising' },
  { suffix: 'googleadservices.com', vendor: 'Google Ads', category: 'advertising' },
  { suffix: 'googlesyndication.com', vendor: 'Google AdSense', category: 'advertising' },
  { suffix: 'connect.facebook.net', vendor: 'Meta Pixel', category: 'advertising' },
  { suffix: 'facebook.com', vendor: 'Meta', category: 'advertising' },
  { suffix: 'analytics.tiktok.com', vendor: 'TikTok Pixel', category: 'advertising' },
  { suffix: 'ads-twitter.com', vendor: 'X Ads', category: 'advertising' },
  { suffix: 'ads.linkedin.com', vendor: 'LinkedIn Ads', category: 'advertising' },
  { suffix: 'px.ads.linkedin.com', vendor: 'LinkedIn Insight', category: 'advertising' },
  { suffix: 'bat.bing.com', vendor: 'Microsoft Advertising', category: 'advertising' },
  { suffix: 'criteo.com', vendor: 'Criteo', category: 'advertising' },
  { suffix: 'criteo.net', vendor: 'Criteo', category: 'advertising' },
  { suffix: 'taboola.com', vendor: 'Taboola', category: 'advertising' },
  { suffix: 'outbrain.com', vendor: 'Outbrain', category: 'advertising' },
  { suffix: 'amazon-adsystem.com', vendor: 'Amazon Ads', category: 'advertising' },
  { suffix: 'tr.snapchat.com', vendor: 'Snap Pixel', category: 'advertising' },
  { suffix: 'sc-static.net', vendor: 'Snap', category: 'advertising' },
  { suffix: 'adsrvr.org', vendor: 'The Trade Desk', category: 'advertising' },
  { suffix: 'rubiconproject.com', vendor: 'Magnite', category: 'advertising' },
  { suffix: 'pubmatic.com', vendor: 'PubMatic', category: 'advertising' },
  { suffix: 'redditstatic.com', vendor: 'Reddit Ads', category: 'advertising' },
  // Tag management / functional
  { suffix: 'googletagmanager.com', vendor: 'Google Tag Manager', category: 'functional' },
  { suffix: 'intercom.io', vendor: 'Intercom', category: 'functional' },
  { suffix: 'intercomcdn.com', vendor: 'Intercom', category: 'functional' },
  { suffix: 'zdassets.com', vendor: 'Zendesk', category: 'functional' },
  { suffix: 'sentry.io', vendor: 'Sentry', category: 'functional' },
  // Consent platforms (functional: they deliver the consent UI)
  { suffix: 'consent.cookiebot.com', vendor: 'Cookiebot', category: 'functional' },
  { suffix: 'cdn.cookielaw.org', vendor: 'OneTrust', category: 'functional' },
  { suffix: 'privacy-center.org', vendor: 'Didomi', category: 'functional' },
  // Security
  { suffix: 'stripe.com', vendor: 'Stripe', category: 'security' },
  { suffix: 'stripe.network', vendor: 'Stripe', category: 'security' },
  { suffix: 'hcaptcha.com', vendor: 'hCaptcha', category: 'security' },
  { suffix: 'recaptcha.net', vendor: 'reCAPTCHA', category: 'security' },
  // CDN
  { suffix: 'cloudflare.com', vendor: 'Cloudflare', category: 'cdn' },
  { suffix: 'cdn.jsdelivr.net', vendor: 'jsDelivr', category: 'cdn' },
  { suffix: 'unpkg.com', vendor: 'unpkg', category: 'cdn' },
  { suffix: 'fonts.googleapis.com', vendor: 'Google Fonts', category: 'cdn' },
  { suffix: 'fonts.gstatic.com', vendor: 'Google Fonts', category: 'cdn' },
  { suffix: 'cloudfront.net', vendor: 'Amazon CloudFront', category: 'cdn' },
  { suffix: 'akamaized.net', vendor: 'Akamai', category: 'cdn' },
];

export interface DomainClassification {
  category: RequestCategory;
  vendor: string | null;
  source: 'known_signature' | 'organization_override' | 'unclassified';
}

export function classifyDomain(host: string, overrides: DomainOverride[] = []): DomainClassification {
  for (const o of overrides) {
    if (matchesDomainSuffix(host, o.domain)) {
      return { category: o.category, vendor: o.vendor ?? null, source: 'organization_override' };
    }
  }
  // Longest-suffix match wins (px.ads.linkedin.com beats linkedin.com-level entries).
  const matches = DOMAIN_SIGNATURES.filter((s) => matchesDomainSuffix(host, s.suffix));
  if (matches.length > 0) {
    const best = matches.sort((a, b) => b.suffix.length - a.suffix.length)[0]!;
    return { category: best.category, vendor: best.vendor, source: 'known_signature' };
  }
  return { category: 'unknown', vendor: null, source: 'unclassified' };
}
