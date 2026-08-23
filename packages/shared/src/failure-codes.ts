/** Structured failure codes. UI translates these into human-readable messages. */
export const FAILURE_CODES = [
  'NAVIGATION_TIMEOUT',
  'NAVIGATION_FAILED',
  'DOMAIN_NOT_AUTHORIZED',
  'SSRF_BLOCKED',
  'INVALID_TARGET_URL',
  'CMP_NOT_DETECTED',
  'REJECT_ACTION_NOT_FOUND',
  'ACCEPT_ACTION_NOT_FOUND',
  'ACTION_AMBIGUOUS',
  'ACTION_CLICK_FAILED',
  'PAGE_CRASHED',
  'EVIDENCE_UPLOAD_FAILED',
  'SCREENSHOT_FAILED',
  'WORKER_TIMEOUT',
  'RULE_ENGINE_FAILED',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  NAVIGATION_TIMEOUT: 'The page did not finish loading within the time limit.',
  NAVIGATION_FAILED: 'The browser could not load the page.',
  DOMAIN_NOT_AUTHORIZED: 'This domain is not verified for automated scanning in your workspace.',
  SSRF_BLOCKED: 'The target resolved to a blocked network location and was not contacted.',
  INVALID_TARGET_URL: 'The target URL is not a valid public HTTP or HTTPS address.',
  CMP_NOT_DETECTED: 'No consent banner or CMP was detected on the page.',
  REJECT_ACTION_NOT_FOUND: 'No reject-style consent action was found in the detected consent interface.',
  ACCEPT_ACTION_NOT_FOUND: 'No accept-style consent action was found in the detected consent interface.',
  ACTION_AMBIGUOUS: 'Multiple candidate consent actions were found and none could be selected safely.',
  ACTION_CLICK_FAILED: 'The consent action was found but could not be clicked.',
  PAGE_CRASHED: 'The page crashed during the scan.',
  EVIDENCE_UPLOAD_FAILED: 'Evidence artifacts could not be stored.',
  SCREENSHOT_FAILED: 'A screenshot could not be captured.',
  WORKER_TIMEOUT: 'The scan exceeded the maximum allowed duration.',
  RULE_ENGINE_FAILED: 'Rule evaluation failed for this scan.',
};
