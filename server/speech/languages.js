/** Whisper / ISO codes we can name honestly. Do not invent unsupported languages. */
const LANGUAGE_NAMES = {
  as: 'Assamese',
  bn: 'Bengali',
  en: 'English',
  gu: 'Gujarati',
  hi: 'Hindi',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  ne: 'Nepali',
  or: 'Odia',
  pa: 'Punjabi',
  sa: 'Sanskrit',
  sd: 'Sindhi',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
};

const INDIC_SCRIPT = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0600-\u06FF]/u;
const LATIN_WORD = /\b[A-Za-z]{2,}\b/;

export function normalizeLanguageCode(code) {
  if (!code || typeof code !== 'string') return undefined;
  const raw = code.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw.includes('-en') || raw.endsWith('+en')) {
    const base = raw.split(/[-+]/)[0];
    return base ? `${base}-en` : undefined;
  }
  return raw.split(/[-_]/)[0] || undefined;
}

export function languageName(code) {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return undefined;
  if (normalized.endsWith('-en')) {
    const base = normalized.slice(0, -3);
    const baseName = LANGUAGE_NAMES[base] || base;
    return `${baseName} + English`;
  }
  return LANGUAGE_NAMES[normalized] || normalized;
}

/**
 * Derive a code-mix label when the model returns one dominant language
 * but the transcript clearly mixes Indic script and English words.
 * Does not invent confidence.
 */
export function applyCodeMixHeuristic(code, transcription) {
  const normalized = normalizeLanguageCode(code);
  const text = String(transcription || '').trim();
  if (!normalized || normalized === 'en' || normalized.endsWith('-en') || !text) {
    return normalized;
  }
  if (!LANGUAGE_NAMES[normalized] || normalized === 'en') {
    return normalized;
  }
  if (INDIC_SCRIPT.test(text) && LATIN_WORD.test(text)) {
    return `${normalized}-en`;
  }
  return normalized;
}

export function buildLanguage(code, transcription) {
  const mixed = applyCodeMixHeuristic(code, transcription);
  if (!mixed) return undefined;
  return {
    code: mixed,
    name: languageName(mixed),
  };
}
