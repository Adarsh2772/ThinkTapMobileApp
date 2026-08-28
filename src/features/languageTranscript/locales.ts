import type { AppLanguageCode } from '@/src/i18n/languages';

/** BCP-47 locale for OS speech recognition (Indian languages). */
export type SpeechLocaleCode =
  | 'en-IN'
  | 'hi-IN'
  | 'bn-IN'
  | 'te-IN'
  | 'mr-IN'
  | 'ta-IN'
  | 'gu-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'pa-IN'
  | 'or-IN'
  | 'as-IN'
  | 'ur-IN';

export type SpeechLocale = {
  code: SpeechLocaleCode;
  name: string;
  nativeName: string;
  /** ISO-639-1-ish code stored on ideas */
  languageCode: string;
  script: 'latin' | 'devanagari' | 'bengali' | 'telugu' | 'tamil' | 'gujarati' | 'kannada' | 'malayalam' | 'gurmukhi' | 'odia' | 'arabic';
};

export const INDIAN_SPEECH_LOCALES: SpeechLocale[] = [
  { code: 'en-IN', name: 'English (India)', nativeName: 'English', languageCode: 'en', script: 'latin' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', languageCode: 'hi', script: 'devanagari' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', languageCode: 'bn', script: 'bengali' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', languageCode: 'te', script: 'telugu' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', languageCode: 'mr', script: 'devanagari' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', languageCode: 'ta', script: 'tamil' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', languageCode: 'gu', script: 'gujarati' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', languageCode: 'kn', script: 'kannada' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', languageCode: 'ml', script: 'malayalam' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', languageCode: 'pa', script: 'gurmukhi' },
  { code: 'or-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', languageCode: 'or', script: 'odia' },
  { code: 'as-IN', name: 'Assamese', nativeName: 'অসমীয়া', languageCode: 'as', script: 'bengali' },
  { code: 'ur-IN', name: 'Urdu', nativeName: 'اردو', languageCode: 'ur', script: 'arabic' },
];

export const DEFAULT_SPEECH_LOCALE: SpeechLocaleCode = 'hi-IN';

/** When the OS cannot report installed packs, try these in order (not all 13). */
export const SAFE_SPEECH_LOCALE_FALLBACK: (SpeechLocaleCode | 'en-US')[] = [
  'hi-IN',
  'mr-IN',
  'en-IN',
  'en-US',
];

export type LocaleAvailability = {
  code: SpeechLocaleCode;
  /** Installed for on-device use, or reported as online-capable */
  available: boolean;
  installedOnDevice: boolean;
  supportedOnDevice: boolean;
  online: boolean;
};

export function getSpeechLocale(code: string | null | undefined): SpeechLocale {
  return (
    INDIAN_SPEECH_LOCALES.find((l) => l.code === code) ??
    INDIAN_SPEECH_LOCALES.find((l) => l.code === DEFAULT_SPEECH_LOCALE)!
  );
}

export function isSpeechLocaleCode(code: string | null | undefined): code is SpeechLocaleCode {
  return INDIAN_SPEECH_LOCALES.some((l) => l.code === code);
}

/** Ordered fallbacks when the device does not support the chosen locale. */
export function speechLocaleFallbackChain(
  primary: SpeechLocaleCode,
): (SpeechLocaleCode | 'en-US')[] {
  const chain: (SpeechLocaleCode | 'en-US')[] = [primary];
  const lang = primary.split('-')[0] ?? '';
  if (lang === 'mr' && !chain.includes('hi-IN')) chain.push('hi-IN');
  if (!chain.includes('en-IN')) chain.push('en-IN');
  if (!chain.includes('en-US')) chain.push('en-US');
  return chain;
}

/**
 * Priority order for auto speech recognition — independent of Settings.
 * Hindi + English are most commonly installed on Indian Android devices.
 */
export const AUTO_RECOGNIZER_LOCALE_PRIORITY: (SpeechLocaleCode | 'en-US')[] = [
  'hi-IN',
  'mr-IN',
  'en-IN',
  'en-US',
  'bn-IN',
  'ta-IN',
  'te-IN',
  'gu-IN',
  'kn-IN',
  'ml-IN',
  'pa-IN',
  'or-IN',
  'as-IN',
  'ur-IN',
];

export function autoSpeechLocaleFallbackChain(): (SpeechLocaleCode | 'en-US')[] {
  return [...AUTO_RECOGNIZER_LOCALE_PRIORITY];
}

/** Best installed locale for multilingual auto-detect (ignores user Settings). */
export function pickBestInstalledSpeechLocale(
  availability: LocaleAvailability[],
): SpeechLocaleCode | 'en-US' {
  const installed = new Set(
    availability
      .filter((row) => row.installedOnDevice || row.supportedOnDevice)
      .map((row) => row.code),
  );
  for (const code of AUTO_RECOGNIZER_LOCALE_PRIORITY) {
    if (code !== 'en-US' && installed.has(code)) return code;
  }
  for (const code of AUTO_RECOGNIZER_LOCALE_PRIORITY) {
    if (code === 'en-US') continue;
    const row = availability.find((r) => r.code === code);
    if (row?.available) return code;
  }
  return 'en-US';
}

/**
 * All locales to rotate for voice commands (wake / stop / pause).
 * Cycling locales lets Marathi work even when English is selected in Settings.
 */
export function listInstalledVoiceLocales(
  availability: LocaleAvailability[],
): (SpeechLocaleCode | 'en-US')[] {
  const locales: (SpeechLocaleCode | 'en-US')[] = [];
  for (const code of AUTO_RECOGNIZER_LOCALE_PRIORITY) {
    if (code === 'en-US') continue;
    const row = availability.find((r) => r.code === code);
    if (row?.installedOnDevice || row?.supportedOnDevice || row?.available) {
      locales.push(code);
    }
  }
  if (!locales.includes('en-IN')) locales.push('en-IN');
  if (!locales.includes('en-US')) locales.push('en-US');
  return locales.length ? locales : ['hi-IN', 'mr-IN', 'en-IN', 'en-US'];
}

/** Pick the first locale in the fallback chain that the device reports as available. */
export function pickAvailableSpeechLocale(
  preferred: SpeechLocaleCode,
  availability: LocaleAvailability[],
): SpeechLocaleCode | 'en-US' {
  const available = new Set(
    availability.filter((row) => row.available).map((row) => row.code),
  );
  const chain = speechLocaleFallbackChain(preferred);
  for (const code of chain) {
    if (code === 'en-US' || available.has(code)) return code;
  }
  return 'en-US';
}

/** Map UI app language → default Indian speech locale. */
export function speechLocaleFromAppLanguage(appCode: AppLanguageCode): SpeechLocaleCode {
  switch (appCode) {
    case 'hi':
      return 'hi-IN';
    case 'mr':
      return 'mr-IN';
    case 'en':
      return 'en-IN';
    default:
      return DEFAULT_SPEECH_LOCALE;
  }
}

function normalizeLocaleTag(tag: string): string {
  return tag.trim().replace(/_/g, '-').toLowerCase();
}

/** Match device-reported tags against our catalog (hi, hi-IN, hi_IN, etc.). */
export function matchCatalogLocale(deviceTag: string): SpeechLocaleCode | null {
  const n = normalizeLocaleTag(deviceTag);
  const exact = INDIAN_SPEECH_LOCALES.find((l) => normalizeLocaleTag(l.code) === n);
  if (exact) return exact.code;
  const langOnly = n.split('-')[0] ?? '';
  const byLang = INDIAN_SPEECH_LOCALES.find((l) => l.languageCode === langOnly);
  return byLang?.code ?? null;
}
