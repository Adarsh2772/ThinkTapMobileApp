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
const DEVANAGARI = /[\u0900-\u097F]/;
const ROMANIZED_INDIC =
  /\b(aaj|kal|hai|hain|hoon|hun|aahe|ahe|mala|majha|majhi|maza|tumhi|aamhi|aap|main|mein|mai|nahi|nahin|kaay|kay|kya|kela|kele|kelay|karu|karna|karo|karun|officela|janar|jaane|jaaunga|bahut|accha|achha|aala|aalaa|aaya|mag|pan|ani|aur|lekin|kyunki|pahije|pahiie|chahiye|kasa|kashi|kuthe|kothe|aajun|ata|atta|ithe|tya|tyala|ti|to|mi|me|amhi)\b/i;
const MARATHI_MARKERS = /आहे|नाही|तुम्ही|आम्ही|मला|माझा|पाहिजे|जाणार|येणार|केला|केलं|\b(aahe|tumhi|aamhi|mala|majha|pahije|janar)\b/i;
const HINDI_MARKERS = /हूँ|हूं|है|नहीं|क्या|चाहिए|आप|\b(hai|hain|chahiye|kya|aap|main|mein)\b/i;

function looksRomanizedIndic(text) {
  const cleaned = String(text || '').toLowerCase();
  if (!cleaned || INDIC_SCRIPT.test(cleaned)) return false;
  const hits = cleaned.match(new RegExp(ROMANIZED_INDIC.source, 'gi'));
  return (hits?.length ?? 0) >= 2;
}

function guessIndicCodeFromText(text) {
  if (MARATHI_MARKERS.test(text)) return 'mr';
  if (HINDI_MARKERS.test(text)) return 'hi';
  if (DEVANAGARI.test(text) || looksRomanizedIndic(text)) return 'hi';
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  return undefined;
}

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
  const text = String(transcription || '').trim();
  const inferred = guessIndicCodeFromText(text);
  let normalized = normalizeLanguageCode(code);
  const iso = normalized && !normalized.endsWith('-en') ? normalized.split(/[-_]/)[0] : normalized;
  // Whisper often labels Hindi/Marathi as Urdu. Trust Devanagari / romanized Indic.
  if (iso === 'ur' && inferred && inferred !== 'ur') {
    normalized = inferred;
  }
  if (!normalized || normalized === 'en' || normalized.endsWith('-en') || !text) {
    return normalized || inferred;
  }
  if (!LANGUAGE_NAMES[normalized.split(/[-_]/)[0]] || normalized === 'en') {
    return normalized;
  }
  if ((INDIC_SCRIPT.test(text) || looksRomanizedIndic(text)) && LATIN_WORD.test(text)) {
    const base = normalized.endsWith('-en') ? normalized.slice(0, -3) : normalized.split(/[-_]/)[0];
    return `${base}-en`;
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
