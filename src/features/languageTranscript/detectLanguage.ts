import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';

/** ISO-639-1 from transcript script / content (no UI setting required). */
export function detectLanguageCodeFromText(text: string): string | null {
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0900-\u097F]/.test(text)) return null; // hi vs mr — use recognizer hint
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  if (/[A-Za-z]/.test(text)) return 'en';
  return null;
}

const ISO_TO_SPEECH_LOCALE: Record<string, SpeechLocaleCode> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  as: 'as-IN',
  ur: 'ur-IN',
};

/** Map live transcript + active recognizer locale → BCP-47 for storage. */
export function detectSpeechLocaleFromText(
  text: string,
  recognizerLocale?: SpeechLocaleCode | 'en-US',
): SpeechLocaleCode | 'en-US' {
  const iso = detectLanguageCodeFromText(text);
  if (iso && ISO_TO_SPEECH_LOCALE[iso]) {
    return ISO_TO_SPEECH_LOCALE[iso]!;
  }
  if (/[\u0900-\u097F]/.test(text)) {
    if (recognizerLocale === 'mr-IN') return 'mr-IN';
    if (recognizerLocale === 'hi-IN') return 'hi-IN';
    return 'hi-IN';
  }
  if (recognizerLocale) return recognizerLocale;
  return 'en-IN';
}
