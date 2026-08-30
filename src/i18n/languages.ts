export type AppLanguageCode =
  | 'en'
  | 'hi'
  | 'mr'
  | 'fr'
  | 'es'
  | 'de'
  | 'pt'
  | 'ar'
  | 'zh'
  | 'ja';

export type AppLanguage = {
  code: AppLanguageCode;
  /** BCP-47 / Whisper language code */
  whisperCode: string;
  name: string;
  nativeName: string;
  flag: string;
  /** Writing system used for transcripts */
  script: 'latin' | 'devanagari' | 'arabic' | 'cjk' | 'japanese';
};

export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'en', whisperCode: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', script: 'latin' },
  { code: 'hi', whisperCode: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', script: 'devanagari' },
  { code: 'mr', whisperCode: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳', script: 'devanagari' },
  { code: 'fr', whisperCode: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', script: 'latin' },
  { code: 'es', whisperCode: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', script: 'latin' },
  { code: 'de', whisperCode: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', script: 'latin' },
  { code: 'pt', whisperCode: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', script: 'latin' },
  { code: 'ar', whisperCode: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', script: 'arabic' },
  { code: 'zh', whisperCode: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', script: 'cjk' },
  { code: 'ja', whisperCode: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', script: 'japanese' },
];

export const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

export type SpokenScript =
  | AppLanguage['script']
  | 'bengali'
  | 'telugu'
  | 'tamil'
  | 'gujarati'
  | 'kannada'
  | 'malayalam'
  | 'gurmukhi'
  | 'odia';

/** Spoken-language metadata used by STT enrichment (may be outside APP_LANGUAGES). */
export type SpokenLanguage = {
  code: string;
  name: string;
  nativeName: string;
  script: SpokenScript;
  whisperCode: string;
};

/** Whisper Indic + English names. Do not invent unsupported languages. */
export const INDIC_SPOKEN_LANGUAGES: SpokenLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', script: 'latin', whisperCode: 'en' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'devanagari', whisperCode: 'hi' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', script: 'devanagari', whisperCode: 'mr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', script: 'bengali', whisperCode: 'bn' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', script: 'telugu', whisperCode: 'te' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', script: 'tamil', whisperCode: 'ta' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'gujarati', whisperCode: 'gu' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', script: 'kannada', whisperCode: 'kn' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', script: 'malayalam', whisperCode: 'ml' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', script: 'gurmukhi', whisperCode: 'pa' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', script: 'odia', whisperCode: 'or' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', script: 'bengali', whisperCode: 'as' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', script: 'arabic', whisperCode: 'ur' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', script: 'devanagari', whisperCode: 'ne' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', script: 'devanagari', whisperCode: 'sa' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', script: 'arabic', whisperCode: 'sd' },
];

const DEVANAGARI_CODES = new Set(['hi', 'mr', 'ne', 'sa']);
const BENGALI_CODES = new Set(['bn', 'as']);
const ARABIC_CODES = new Set(['ar', 'fa', 'ur', 'sd']);
const CJK_CODES = new Set(['zh', 'yue', 'zh-cn', 'zh-tw']);
const JAPANESE_CODES = new Set(['ja']);

function findIndicSpoken(code: string): SpokenLanguage | undefined {
  return INDIC_SPOKEN_LANGUAGES.find((l) => l.code === code || l.whisperCode === code);
}

function withEnglishMix(base: SpokenLanguage, mixedCode: string): SpokenLanguage {
  return {
    ...base,
    code: mixedCode,
    name: `${base.name} + English`,
    whisperCode: mixedCode,
  };
}

const INDIC_SCRIPT =
  /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0600-\u06FF]/u;
const LATIN_WORD = /\b[A-Za-z]{2,}\b/;
const DEVANAGARI = /[\u0900-\u097F]/;
const ROMANIZED_INDIC =
  /\b(aaj|kal|hai|hain|hoon|hun|aahe|ahe|mala|majha|majhi|maza|tumhi|aamhi|aap|main|mein|mai|nahi|nahin|kaay|kay|kya|kela|kele|kelay|karu|karna|karo|karun|officela|janar|jaane|jaaunga|bahut|accha|achha|aala|aalaa|aaya|mag|pan|ani|aur|lekin|kyunki|pahije|pahiie|chahiye|kasa|kashi|kuthe|kothe|aajun|ata|atta|ithe|ithe|tya|tyala|ti|to|mi|me|amhi)\b/i;
const MARATHI_MARKERS = /आहे|नाही|तुम्ही|आम्ही|मला|माझा|पाहिजे|जाणार|येणार|केला|केलं|\b(aahe|tumhi|aamhi|mala|majha|pahije|janar)\b/i;
const HINDI_MARKERS = /हूँ|हूं|है|नहीं|क्या|चाहिए|आप|\b(hai|hain|chahiye|kya|aap|main|mein)\b/i;

export function hasIndicScript(text: string): boolean {
  return INDIC_SCRIPT.test(text ?? '');
}

export function looksRomanizedIndic(text: string): boolean {
  const cleaned = (text ?? '').toLowerCase();
  if (!cleaned || INDIC_SCRIPT.test(cleaned)) return false;
  const hits = cleaned.match(new RegExp(ROMANIZED_INDIC.source, 'gi'));
  return (hits?.length ?? 0) >= 2;
}

function guessIndicCodeFromText(text: string): string | undefined {
  if (MARATHI_MARKERS.test(text)) return 'mr';
  if (HINDI_MARKERS.test(text)) return 'hi';
  if (DEVANAGARI.test(text) || looksRomanizedIndic(text)) return 'hi';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  return undefined;
}

/** Derive hi-en style labels when transcript mixes Indic script and English words. */
export function applyCodeMixIfNeeded(code: string | null | undefined, transcription: string): string | undefined {
  const text = (transcription ?? '').replace(/\s+/g, ' ').trim();
  const inferred = guessIndicCodeFromText(text);
  const raw = (code ?? '').trim().toLowerCase();
  const isoFromWhisper = raw && raw !== 'en' && !/[-+]en$/.test(raw) ? raw.split(/[-_+]/)[0] : undefined;
  const iso = isoFromWhisper || inferred;
  if (!iso) return raw || undefined;
  if (iso !== 'en' && findIndicSpoken(iso) && (INDIC_SCRIPT.test(text) || looksRomanizedIndic(text)) && LATIN_WORD.test(text)) {
    return `${iso}-en`;
  }
  if (iso !== 'en') return iso;
  return raw || inferred || 'en';
}

export function getLanguage(code: string | null | undefined): AppLanguage {
  return APP_LANGUAGES.find((l) => l.code === code) ?? APP_LANGUAGES[0];
}

/** Map Whisper / ISO language codes to app languages when known. */
export function findLanguageByWhisperCode(code: string | null | undefined): AppLanguage | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toLowerCase().split(/[-_+]/)[0] ?? '';
  return (
    APP_LANGUAGES.find((l) => l.whisperCode === normalized || l.code === normalized) ??
    undefined
  );
}

/**
 * Resolve auto-detected STT language into enrichment metadata.
 * Known app languages keep native scripts; unknown ISO codes use latin defaults.
 */
export function resolveSpokenLanguage(
  detectedCode: string | null | undefined,
  fallbackUiCode?: AppLanguageCode,
): SpokenLanguage {
  const raw = (detectedCode ?? '').trim().toLowerCase();
  const isMixed = /[-+]en$/.test(raw);
  const iso = raw.split(/[-_+]/)[0] || '';

  const indic = iso ? findIndicSpoken(iso) : undefined;
  if (indic) {
    return isMixed ? withEnglishMix(indic, raw.includes('+') ? `${iso}-en` : raw) : indic;
  }

  const known = findLanguageByWhisperCode(iso || detectedCode);
  if (known) {
    const spoken: SpokenLanguage = {
      code: known.code,
      name: known.name,
      nativeName: known.nativeName,
      script: known.script,
      whisperCode: known.whisperCode,
    };
    return isMixed ? withEnglishMix(spoken, `${known.code}-en`) : spoken;
  }

  if (iso) {
    let script: SpokenScript = 'latin';
    if (DEVANAGARI_CODES.has(iso)) script = 'devanagari';
    else if (BENGALI_CODES.has(iso)) script = 'bengali';
    else if (ARABIC_CODES.has(iso)) script = 'arabic';
    else if (CJK_CODES.has(iso) || iso === 'zh') script = 'cjk';
    else if (JAPANESE_CODES.has(iso)) script = 'japanese';

    const spoken: SpokenLanguage = {
      code: isMixed ? `${iso}-en` : iso,
      name: isMixed ? `${iso} + English` : iso,
      nativeName: iso,
      script,
      whisperCode: isMixed ? `${iso}-en` : iso,
    };
    return spoken;
  }

  const fallback = getLanguage(fallbackUiCode);
  return {
    code: fallback.code,
    name: fallback.name,
    nativeName: fallback.nativeName,
    script: fallback.script,
    whisperCode: fallback.whisperCode,
  };
}
