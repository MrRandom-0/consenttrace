/**
 * Deterministic consent-control classification from visible text / aria-label.
 * This is the primary strategy; known-CMP selectors take priority above it and
 * AI classification (Phase 2) sits below it behind a safety validator.
 */
import type { Confidence, ConsentActionType } from '@consenttrace/shared';

export interface ActionClassification {
  action: ConsentActionType;
  confidence: Confidence;
  matchedPattern: string | null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s×]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PatternGroup {
  action: ConsentActionType;
  exact: string[];
  strong: RegExp[];
  weak: RegExp[];
}

// Order matters: earlier groups win. Negated-accept and "necessary only" phrasing
// must be checked before generic accept keywords.
const GROUPS: PatternGroup[] = [
  {
    action: 'necessary_only',
    exact: [
      'only necessary', 'necessary only', 'only essential', 'essential only', 'essential cookies only',
      'use necessary cookies only', 'only required', 'required only', 'nur notwendige', 'nur erforderliche',
      'solo necesarias', 'seulement necessaires', 'strictly necessary only',
    ],
    strong: [/\b(only|just)\b.*\b(necessary|essential|required|strictly)\b/, /\b(necessary|essential|required)\b.*\bonly\b/],
    weak: [],
  },
  {
    action: 'save_preferences',
    exact: [
      'save', 'save preferences', 'save settings', 'save choices', 'confirm choices', 'confirm my choices',
      'allow selection', 'save and close', 'save my preferences', 'auswahl erlauben', 'enregistrer',
    ],
    strong: [/\bsave\b/, /\bconfirm (my )?(choices|selection|preferences)\b/, /\ballow selection\b/],
    weak: [],
  },
  {
    action: 'withdraw',
    exact: ['withdraw consent', 'withdraw', 'revoke consent', 'revoke', 'opt out', 'opt-out'],
    strong: [/\bwithdraw\b/, /\brevoke\b/, /\bopt out\b/],
    weak: [],
  },
  {
    action: 'reject_all',
    exact: [
      'reject all', 'decline all', 'refuse all', 'deny all', 'reject all cookies', 'decline all cookies',
      'reject non essential', 'disagree', 'i do not accept', 'do not accept', 'continue without accepting',
      'continue without agreeing', 'no thanks', 'tout refuser', 'alle ablehnen', 'ablehnen', 'rechazar todo',
      'rifiuta tutto', 'alles afwijzen', 'odrzuc wszystkie', 'afvis alle', 'reject',
    ],
    strong: [
      /\b(do not|dont|don t|never|without)\b.*\b(accept|agree|consent)\b/,
      /\b(reject|decline|refuse|deny|disagree)\b/,
      /\b(refuser|ablehnen|rechazar|rifiuta|afwijzen|odmowa|weigeren)\b/,
    ],
    weak: [],
  },
  {
    action: 'accept_all',
    exact: [
      'accept all', 'allow all', 'accept all cookies', 'allow all cookies', 'agree to all', 'agree and close',
      'accept cookies', 'i agree', 'agree', 'accept', 'allow', 'yes i agree', 'tout accepter', 'alle akzeptieren',
      'akzeptieren', 'aceptar todo', 'accetta tutto', 'alles accepteren', 'zaakceptuj wszystkie', 'accepter alle',
      'accept everything', 'enable all',
    ],
    strong: [
      /\b(accept|allow|agree|enable)\b.*\ball\b/,
      /\b(accept|allow|agree)\b/,
      /\b(accepter|akzeptieren|aceptar|accetta|accepteren|zgadzam)\b/,
    ],
    weak: [/^(ok|okay|got it|understood|continue)$/],
  },
  {
    action: 'manage_preferences',
    exact: [
      'cookie settings', 'manage preferences', 'manage cookies', 'manage options', 'manage settings',
      'customize', 'customise', 'preferences', 'settings', 'options', 'more options', 'let me choose',
      'personalize', 'personnaliser', 'einstellungen', 'configurar', 'personalizza', 'instellingen', 'choose cookies',
    ],
    strong: [/\b(manage|customize|customise|configure|choose)\b/, /\b(settings|preferences|options)\b/],
    weak: [/\blearn more\b/, /\bmore information\b/],
  },
  {
    action: 'close',
    exact: ['close', 'dismiss', '×', 'x', 'schliessen', 'fermer', 'cerrar'],
    strong: [/^close$/, /^dismiss$/],
    weak: [],
  },
];

/** Classify a consent-interface control from its text and aria-label. */
export function classifyConsentControl(text: string, ariaLabel?: string | null): ActionClassification {
  const candidates = [normalize(text || ''), normalize(ariaLabel || '')].filter(Boolean);
  if (candidates.length === 0) return { action: 'unknown', confidence: 'low', matchedPattern: null };

  for (const source of candidates) {
    for (const group of GROUPS) {
      if (group.exact.includes(source)) {
        return { action: group.action, confidence: 'high', matchedPattern: source };
      }
    }
  }
  for (const source of candidates) {
    for (const group of GROUPS) {
      const strong = group.strong.find((re) => re.test(source));
      if (strong) return { action: group.action, confidence: 'medium', matchedPattern: strong.source };
      const weak = group.weak.find((re) => re.test(source));
      if (weak) return { action: group.action, confidence: 'low', matchedPattern: weak.source };
    }
  }
  return { action: 'unknown', confidence: 'low', matchedPattern: null };
}

export interface CandidateControl {
  ctId: string;
  tag: string;
  role: string | null;
  text: string;
  ariaLabel: string | null;
  visible: boolean;
  enabled: boolean;
}

export interface SelectedAction {
  candidate: CandidateControl;
  classification: ActionClassification;
}

/**
 * Pick the best candidate for a desired action. Deterministic:
 * highest confidence wins; ties broken by shortest text (most specific button),
 * then document order. Low-confidence candidates are only used when nothing
 * better exists AND the caller allows it — callers must treat low confidence
 * as "needs review", never as a silent click.
 */
export function selectActionCandidate(
  candidates: CandidateControl[],
  desired: ConsentActionType,
  minimumConfidence: Confidence = 'medium',
): SelectedAction | null {
  const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
  const matches = candidates
    .filter((c) => c.visible && c.enabled)
    .map((c) => ({ candidate: c, classification: classifyConsentControl(c.text, c.ariaLabel) }))
    .filter((m) => m.classification.action === desired)
    .filter((m) => rank[m.classification.confidence] >= rank[minimumConfidence]);
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const dc = rank[b.classification.confidence] - rank[a.classification.confidence];
    if (dc !== 0) return dc;
    return a.candidate.text.length - b.candidate.text.length;
  });
  return matches[0]!;
}
