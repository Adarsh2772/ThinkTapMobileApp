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
  script:
    | 'latin'
    | 'devanagari'
    | 'arabic'
    | 'cjk'
    | 'japanese'
    | 'bengali'
    | 'telugu'
    | 'tamil'
    | 'gujarati'
    | 'kannada'
    | 'malayalam'
    | 'gurmukhi'
    | 'odia';
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

/** Spoken-language metadata used by STT enrichment (may be outside APP_LANGUAGES). */
export type SpokenLanguage = {
  code: string;
  name: string;
  nativeName: string;
  script: AppLanguage['script'];
  whisperCode: string;
};

const DEVANAGARI_CODES = new Set(['hi', 'mr', 'ne', 'sa']);
const BENGALI_CODES = new Set(['bn', 'as']);
const ARABIC_CODES = new Set(['ar', 'fa', 'ur']);
const CJK_CODES = new Set(['zh', 'yue', 'zh-cn', 'zh-tw']);
const JAPANESE_CODES = new Set(['ja']);
const TAMIL_CODES = new Set(['ta']);
const TELUGU_CODES = new Set(['te']);
const GUJARATI_CODES = new Set(['gu']);
const KANNADA_CODES = new Set(['kn']);
const MALAYALAM_CODES = new Set(['ml']);
const GURMUKHI_CODES = new Set(['pa']);
const ODIA_CODES = new Set(['or', 'od']);

/** Display names for auto-detected spoken languages (incl. beyond UI app languages). */
const SPOKEN_LANGUAGE_NAMES: Record<string, { name: string; nativeName: string }> = {
  en: { name: 'English', nativeName: 'English' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी' },
  mr: { name: 'Marathi', nativeName: 'मराठी' },
  bn: { name: 'Bengali', nativeName: 'বাংলা' },
  te: { name: 'Telugu', nativeName: 'తెలుగు' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  or: { name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  as: { name: 'Assamese', nativeName: 'অসমীয়া' },
  ur: { name: 'Urdu', nativeName: 'اردو' },
  ar: { name: 'Arabic', nativeName: 'العربية' },
  fr: { name: 'French', nativeName: 'Français' },
  es: { name: 'Spanish', nativeName: 'Español' },
  de: { name: 'German', nativeName: 'Deutsch' },
  pt: { name: 'Portuguese', nativeName: 'Português' },
  zh: { name: 'Chinese', nativeName: '中文' },
  ja: { name: 'Japanese', nativeName: '日本語' },
};

export function getLanguage(code: string | null | undefined): AppLanguage {
  return APP_LANGUAGES.find((l) => l.code === code) ?? APP_LANGUAGES[0];
}

/** Map Whisper / ISO language codes to app languages when known. */
export function findLanguageByWhisperCode(code: string | null | undefined): AppLanguage | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
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
  const known = findLanguageByWhisperCode(detectedCode);
  if (known) {
    return {
      code: known.code,
      name: known.name,
      nativeName: known.nativeName,
      script: known.script,
      whisperCode: known.whisperCode,
    };
  }

  const raw = (detectedCode ?? '').trim().toLowerCase();
  const iso = raw.split(/[-_]/)[0] || '';
  if (iso) {
    let script: AppLanguage['script'] = 'latin';
    if (DEVANAGARI_CODES.has(iso)) script = 'devanagari';
    else if (BENGALI_CODES.has(iso)) script = 'bengali';
    else if (TAMIL_CODES.has(iso)) script = 'tamil';
    else if (TELUGU_CODES.has(iso)) script = 'telugu';
    else if (GUJARATI_CODES.has(iso)) script = 'gujarati';
    else if (KANNADA_CODES.has(iso)) script = 'kannada';
    else if (MALAYALAM_CODES.has(iso)) script = 'malayalam';
    else if (GURMUKHI_CODES.has(iso)) script = 'gurmukhi';
    else if (ODIA_CODES.has(iso)) script = 'odia';
    else if (ARABIC_CODES.has(iso)) script = 'arabic';
    else if (CJK_CODES.has(iso) || iso === 'zh') script = 'cjk';
    else if (JAPANESE_CODES.has(iso)) script = 'japanese';

    const named = SPOKEN_LANGUAGE_NAMES[iso];
    return {
      code: iso,
      name: named?.name ?? iso,
      nativeName: named?.nativeName ?? iso,
      script,
      whisperCode: iso,
    };
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
