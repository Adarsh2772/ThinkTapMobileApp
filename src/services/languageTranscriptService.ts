import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import { ensureRecordingsDirectory } from '@/src/services/audioStorage';
import { allVoiceCommandContextualStrings } from '@/src/features/wakeWord/phrases';

import {
  autoSpeechLocaleFallbackChain,
  INDIAN_SPEECH_LOCALES,
  matchCatalogLocale,
  pickAvailableSpeechLocale,
  pickBestInstalledSpeechLocale,
  listInstalledVoiceLocales,
  SAFE_SPEECH_LOCALE_FALLBACK,
  speechLocaleFallbackChain,
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
  const sharedEn = [
    'stop',
    'stop recording',
    'please stop',
    'pause',
    'pause recording',
    'resume',
    'resume recording',
    'continue',
    'start recording',
  ];
  switch (lang) {
    case 'mr-IN':
      return [
        'रेकॉर्डिंग सुरू करा',
        'रेकॉर्डिंग सुरु करा',
        'रेकॉर्डिंग चालू करा',
        'सुरू करा',
        'थांबा',
        'थांब',
        'थांबवा',
        'बंद करा',
        'बंद',
        'बस',
        ...sharedEn,
      ];
    case 'hi-IN':
      return [
        'रिकॉर्डिंग शुरू करो',
        'रिकॉर्डिंग शुरू करें',
        'शुरू करो',
        'शुरू करें',
        'थांबा',
        'थांब',
        'बंद करो',
        'बंद',
        'रुको',
        'बस',
        ...sharedEn,
      ];
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
      return [
        'stop',
        'stop recording',
        'please stop',
        'end recording',
        'pause',
        'pause recording',
        'resume',
        'start recording',
        'Hey Think Tap',
      ];
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
    clearSpeechLocaleCache();
  }

  const installedSet = new Set(
    installed.map(matchCatalogLocale).filter(Boolean) as SpeechLocaleCode[],
  );
  const supportedSet = new Set(
    locales.map(matchCatalogLocale).filter(Boolean) as SpeechLocaleCode[],
  );

  const localeQueryFailed = installedSet.size === 0 && supportedSet.size === 0;

  // When Google speech returns error 14 / empty lists, do not assume every Indian
  // locale is installed — that causes language-not-supported loops on English-only phones.
  if (localeQueryFailed) {
    const safe = new Set(SAFE_SPEECH_LOCALE_FALLBACK);
    return INDIAN_SPEECH_LOCALES.map((locale) => ({
      code: locale.code,
      available: safe.has(locale.code),
      installedOnDevice: false,
      supportedOnDevice: false,
      online: true,
    }));
  }

  return INDIAN_SPEECH_LOCALES.map((locale) => {
    const installedOnDevice = installedSet.has(locale.code);
    const supportedOnDevice = supportedSet.has(locale.code);
    const online = supportedOnDevice || !installedOnDevice;
    return {
      code: locale.code,
      available: installedOnDevice || supportedOnDevice,
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
  lang: SpeechLocaleCode | 'en-US';
  /** Bias toward wake/stop/pause phrases in every supported language. */
  contextualStrings?: string[];
  requiresOnDeviceRecognition?: boolean;
  outputFileName?: string;
  /** Persist recognized audio. Disable on retries — persist can leave the mic busy. */
  persist?: boolean;
};

let localeAvailabilityCache: LocaleAvailability[] | null = null;

/** Cached device locale list — refreshed after a failed start. */
export async function getCachedIndianLocaleAvailability(
  refresh = false,
): Promise<LocaleAvailability[]> {
  if (refresh || !localeAvailabilityCache) {
    localeAvailabilityCache = await getIndianLocaleAvailability();
  }
  return localeAvailabilityCache;
}

export function clearSpeechLocaleCache(): void {
  localeAvailabilityCache = null;
}

/** Best locale for this device before starting SpeechRecognizer (avoids beep loops). */
export async function resolveDeviceSpeechLocale(
  preferred: SpeechLocaleCode,
): Promise<SpeechLocaleCode | 'en-US'> {
  const availability = await getCachedIndianLocaleAvailability();
  return pickAvailableSpeechLocale(preferred, availability);
}

/** Auto locale — ignores Settings; prefers Devanagari packs (hi/mr) over English. */
export async function resolveAutoSpeechLocale(): Promise<SpeechLocaleCode | 'en-US'> {
  const availability = await getCachedIndianLocaleAvailability();
  return pickBestInstalledSpeechLocale(availability);
}

/** Locales to round-robin for wake/stop commands (multilingual, Settings-independent). */
export async function listVoiceCommandLocales(): Promise<(SpeechLocaleCode | 'en-US')[]> {
  const availability = await getCachedIndianLocaleAvailability();
  return listInstalledVoiceLocales(availability);
}

export { autoSpeechLocaleFallbackChain, allVoiceCommandContextualStrings };

/**
 * Only Android 13+ writes the recognized audio to a file — below that the
 * recognizer cannot share the mic with a recorder at all. Other platforms
 * capture the take with expo-audio instead, so a second file is not needed.
 */
function canPersistRecognitionAudio(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 33;
}

export async function startLiveRecognition(options: LiveRecognitionOptions): Promise<void> {
  const lang = options.lang;
  const persist = (options.persist ?? true) && canPersistRecognitionAudio();

  let recordingOptions: { persist: true; outputDirectory: string; outputFileName: string } | undefined;
  if (persist) {
    const outputDirectory = await ensureRecordingsDirectory();
    if (outputDirectory) {
      recordingOptions = {
        persist: true,
        outputDirectory,
        outputFileName: options.outputFileName ?? `idea-${Date.now()}.wav`,
      };
    }
  }

  ExpoSpeechRecognitionModule.start({
    lang,
    interimResults: true,
    continuous: true,
    addsPunctuation: lang === 'en-IN' || lang === 'en-US',
    requiresOnDeviceRecognition: options.requiresOnDeviceRecognition ?? false,
    iosTaskHint: 'dictation',
    contextualStrings: options.contextualStrings ?? allVoiceCommandContextualStrings(),
    ...(recordingOptions ? { recordingOptions } : {}),
    // Silence lengths are deliberately not set here: expo-speech-recognition
    // applies its own long continuous-mode values last, and overriding them
    // makes the engine close the session on every natural pause.
    androidIntentOptions: {
      EXTRA_LANGUAGE_MODEL: 'free_form',
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
    /\b(please\s+)?pause(\s+(the\s+)?recording)?\s*$/i,
    /\b(resume|continue)(\s+recording)?\s*$/i,
    /(थांबा|थांब|थांबवा|बंद\s*करा?|बंद\s*करो|रोका|रुको|बस)\s*$/u,
    /(நிறுத்து|நிறுத்துங்கள்|ரூகோ|போதும்)\s*$/u,
    /(বন্ধ\s*কর|থামো|থামুন)\s*$/u,
    /(ఆపు|ఆపండి|ఆగు)\s*$/u,
    /(റെക്കോർഡിംഗ് നിർത്തുക|നിർത്തുക|നിർത്തൂ)\s*$/u,
    /(ରେକର୍ଡିଂ ବନ୍ଦ କର|ବନ୍ଦ କର)\s*$/u,
    /(ৰেকৰ্ডিং বন্ধ কৰক|বন্ধ কৰক)\s*$/u,
    /(ریکارڈنگ بند کریں|بند کرو|روکو)\s*$/u,
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
