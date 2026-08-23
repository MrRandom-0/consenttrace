import { z } from 'zod';

export const scenarioTypeSchema = z.enum([
  'no_action',
  'accept_all',
  'reject_all',
  'essential_only',
  'custom_preferences',
  'withdraw_consent',
]);

export const scanRequestSchema = z.object({
  url: z.string().url().max(2048),
  scenarios: z.array(scenarioTypeSchema).min(1).default(['no_action', 'reject_all', 'accept_all']),
  settleMs: z.number().int().min(500).max(30000).default(3000),
  bannerWaitMs: z.number().int().min(500).max(30000).default(8000),
  navTimeoutMs: z.number().int().min(5000).max(60000).default(30000),
  viewport: z
    .object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(320).max(2160) })
    .default({ width: 1366, height: 900 }),
  locale: z.string().min(2).max(20).default('en-GB'),
  timezoneId: z.string().max(64).optional(),
});

export type ScanRequest = z.infer<typeof scanRequestSchema>;

export const cookieOverrideSchema = z.object({
  pattern: z.string().min(1).max(200),
  isRegex: z.boolean().optional(),
  category: z.enum(['strictly_necessary', 'functional', 'analytics', 'advertising', 'unknown']),
  vendor: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

export const domainOverrideSchema = z.object({
  domain: z.string().min(1).max(253),
  category: z.enum(['analytics', 'advertising', 'personalization', 'functional', 'cdn', 'security', 'unknown']),
  vendor: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});
