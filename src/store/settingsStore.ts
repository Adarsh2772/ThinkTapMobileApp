import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  DEFAULT_SPEECH_LOCALE,
  getSpeechLocale,
  isSpeechLocaleCode,
  speechLocaleFromAppLanguage,
  type SpeechLocale,
  type SpeechLocaleCode,
} from '@/src/features/languageTranscript/locales';
import {
  APP_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguage,
  type AppLanguage,
  type AppLanguageCode,
} from '@/src/i18n/languages';
import { t } from '@/src/i18n/translations';

const LANGUAGE_KEY = '@thinktap/app_language';
const SPEECH_LOCALE_KEY = '@thinktap/speech_locale';

type SettingsState = {
  languageCode: AppLanguageCode;
  speechLocale: SpeechLocaleCode;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLanguage: (code: AppLanguageCode) => Promise<void>;
  setSpeechLocale: (code: SpeechLocaleCode) => Promise<void>;
  language: () => AppLanguage;
  speechLanguage: () => SpeechLocale;
  tx: (key: Parameters<typeof t>[1]) => string;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  languageCode: DEFAULT_LANGUAGE,
  speechLocale: DEFAULT_SPEECH_LOCALE,
  hydrated: false,

  hydrate: async () => {
    let languageCode: AppLanguageCode = DEFAULT_LANGUAGE;
    let speechLocale: SpeechLocaleCode = DEFAULT_SPEECH_LOCALE;

    try {
      const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (raw && APP_LANGUAGES.some((l) => l.code === raw)) {
        languageCode = raw as AppLanguageCode;
      }
    } catch {
      // ignore
    }

    try {
      const rawSpeech = await AsyncStorage.getItem(SPEECH_LOCALE_KEY);
      if (isSpeechLocaleCode(rawSpeech)) {
        speechLocale = rawSpeech;
      } else {
        speechLocale = speechLocaleFromAppLanguage(languageCode);
      }
    } catch {
      speechLocale = speechLocaleFromAppLanguage(languageCode);
    }

    set({ languageCode, speechLocale, hydrated: true });
  },

  setLanguage: async (code) => {
    // Keep OS STT locale in sync when the UI language maps to an Indian / EN locale.
    // (Users often change App Language expecting Hindi/Marathi transcripts.)
    const mappedSpeech = speechLocaleFromAppLanguage(code);
    const shouldSyncSpeech = code === 'hi' || code === 'mr' || code === 'en';
    if (shouldSyncSpeech) {
      set({ languageCode: code, speechLocale: mappedSpeech });
      await AsyncStorage.setItem(LANGUAGE_KEY, code);
      await AsyncStorage.setItem(SPEECH_LOCALE_KEY, mappedSpeech);
      return;
    }
    set({ languageCode: code });
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  },

  setSpeechLocale: async (code) => {
    set({ speechLocale: code });
    await AsyncStorage.setItem(SPEECH_LOCALE_KEY, code);
  },

  language: () => getLanguage(get().languageCode),

  speechLanguage: () => getSpeechLocale(get().speechLocale),

  tx: (key) => t(get().languageCode, key),
}));
