import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import {
  INDIAN_SPEECH_LOCALES,
  matchCatalogLocale,
  type LocaleAvailability,
  type SpeechLocaleCode,
} from '@/src/features/languageTranscript/locales';

export type SupportedLocalesSnapshot = {
  locales: string[];
  installedLocales: string[];
};

/** Prefer Google services when visible to the app; otherwise use the system default. */
function resolveAndroidSpeechPackage(): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  try {
    const services =
      typeof ExpoSpeechRecognitionModule.getSpeechRecognitionServices === 'function'
        ? ExpoSpeechRecognitionModule.getSpeechRecognitionServices()
        : [];
    const preferred = [
      'com.google.android.googlequicksearchbox',
      'com.google.android.tts',
      'com.google.android.as',
    ];
    for (const pkg of preferred) {
      if (services.includes(pkg)) return pkg;
    }
  } catch {
    // ignore
  }
  // Do not hardcode a package that isn't queryable — start() will fail and break wake/stop.
  return undefined;
}

/** Stop / bias phrases in the selected script so English bias does not force Latin output. */
function contextualStringsForLocale(lang: string): string[] {
  const sharedEn = ['stop', 'stop recording', 'please stop'];
  switch (lang) {
    case 'hi-IN':
      return ['थांबा', 'थांब', 'बंद करो', 'बंद', 'रुको', 'बस', ...sharedEn];
    case 'mr-IN':
      return ['थांबा', 'थांब', 'थांबवा', 'बंद करा', 'बंद', 'बस', ...sharedEn];
    case 'bn-IN':
      return ['বন্ধ কর', 'থামো', 'থামুন', ...sharedEn];
    case 'te-IN':
      return ['ఆపు', 'ఆపండి', 'ఆగు', ...sharedEn];
    case 'ta-IN':
      return ['நிறுத்து', 'நிறுத்துங்கள்', 'போதும்', ...sharedEn];
    case 'gu-IN':
      return ['બંધ કરો', 'રોકો', ...sharedEn];
    case 'kn-IN':
      return ['ನಿಲ್ಲಿಸಿ', 'ನಿಲ್ಲು', ...sharedEn];
    case 'ml-IN':
      return ['നിർത്തുക', 'നിർത്തൂ', ...sharedEn];
    case 'pa-IN':
      return ['ਬੰਦ ਕਰੋ', 'ਰੋਕੋ', ...sharedEn];
    case 'or-IN':
      return ['ବନ୍ଦ କର', 'ରୋକ', ...sharedEn];
    case 'as-IN':
      return ['বন্ধ কৰক', 'থামক', ...sharedEn];
    case 'ur-IN':
      return ['بند کرو', 'روکو', ...sharedEn];
    case 'en-US':
    case 'en-IN':
    default:
      return ['stop', 'stop recording', 'please stop', 'end recording', 'Hey Think Tap'];
  }
}

/**
 * Query which Indian speech locales the OS reports as available.
 * Availability varies by device / Google speech packs / Apple locales.
 */
export async function getIndianLocaleAvailability(): Promise<LocaleAvailability[]> {
  let locales: string[] = [];
  let installed: string[] = [];

  try {
    const result = (await ExpoSpeechRecognitionModule.getSupportedLocales({
      androidRecognitionServicePackage: resolveAndroidSpeechPackage(),
    })) as SupportedLocalesSnapshot;

    locales = result?.locales ?? [];
    installed = result?.installedLocales ?? [];
  } catch (e) {
    console.warn('getSupportedLocales failed', e);
  }

  const installedSet = new Set(
    installed.map(matchCatalogLocale).filter(Boolean) as SpeechLocaleCode[],
  );
  const supportedSet = new Set(
    locales.map(matchCatalogLocale).filter(Boolean) as SpeechLocaleCode[],
  );

  const deviceReportedNothing = installedSet.size === 0 && supportedSet.size === 0;

  return INDIAN_SPEECH_LOCALES.map((locale) => {
    const installedOnDevice = installedSet.has(locale.code);
    const supportedOnDevice = supportedSet.has(locale.code);
    const online = deviceReportedNothing || supportedOnDevice || !installedOnDevice;
    return {
      code: locale.code,
      available: installedOnDevice || supportedOnDevice || deviceReportedNothing,
      installedOnDevice,
      supportedOnDevice: supportedOnDevice && !installedOnDevice,
      online,
    };
  });
}

export async function requestSpeechPermissions(): Promise<boolean> {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return !!perm.granted;
}

export function isSpeechRecognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Prompt Android to download an offline speech model for a locale. */
export async function triggerOfflineModelDownload(locale: SpeechLocaleCode): Promise<void> {
  if (Platform.OS !== 'android') return;
  const fn = ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload;
  if (typeof fn !== 'function') return;
  await fn({ locale });
}

export type LiveRecognitionOptions = {
  /** BCP-47 locale, or en-US when alternating for voice-stop detection. */
  lang: SpeechLocaleCode | 'en-US';
  /** Prefer offline packs when installed; default false for broader Indian coverage. */
  requiresOnDeviceRecognition?: boolean;
};

/**
 * Start a live OS recognition session (mic).
 *
 * Important: `lang` + Android EXTRA_LANGUAGE must match the spoken language
 * (e.g. hi-IN) or Google defaults to English / Latin script.
 */
export function startLiveRecognition(options: LiveRecognitionOptions): void {
  const lang = options.lang;
  const androidPackage = resolveAndroidSpeechPackage();

  ExpoSpeechRecognitionModule.start({
    lang,
    interimResults: true,
    continuous: Platform.OS === 'ios',
    // Punctuation formatting can force Latin output on some Android builds — keep off for Indic.
    addsPunctuation: lang === 'en-IN' || lang === 'en-US',
    requiresOnDeviceRecognition: options.requiresOnDeviceRecognition ?? false,
    iosTaskHint: 'dictation',
    contextualStrings: contextualStringsForLocale(lang),
    androidRecognitionServicePackage: androidPackage,
    androidIntentOptions: {
      EXTRA_LANGUAGE_MODEL: 'free_form',
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
      EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 500,
      // Not in the TS type surface, but RecognizerIntent.EXTRA_LANGUAGE exists and
      // reinforces hi-IN / mr-IN so the engine does not fall back to English.
      ...({ EXTRA_LANGUAGE: lang } as Record<string, string>),
    },
  });
}

export function stopLiveRecognition(): void {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // ignore
  }
}

export function abortLiveRecognition(): void {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // ignore
  }
}

/** Strip trailing stop-command words from a transcript. */
export function stripTrailingStopCommand(transcript: string): string {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const patterns = [
    /\b(please\s+)?stop(\s+recording)?\s*$/i,
    /\b(end|finish)\s+recording\s*$/i,
    /(थांबा|थांब|थांबवा|बंद\s*करा?|बंद\s*करो|रोका|रुको|बस)\s*$/u,
    /(நிறுத்து|நிறுத்துங்கள்|ரூகோ|போதும்)\s*$/u,
    /(বন্ধ\s*কর|থামো|থামুন)\s*$/u,
    /(ఆపు|ఆపండి|ఆగు)\s*$/u,
    /(ನಿಲ್ಲಿಸಿ|ನಿಲ್ಲು)\s*$/u,
    /(നിർത്തുക|നിർത്തൂ)\s*$/u,
    /(બંધ\s*કરો|રોકો)\s*$/u,
    /(ਬੰਦ\s*ਕਰੋ|ਰੋਕੋ)\s*$/u,
    /(بند\s*کرو|روکو)\s*$/u,
  ];

  let result = cleaned;
  for (const re of patterns) {
    result = result.replace(re, '').trim();
  }
  return result;
}
