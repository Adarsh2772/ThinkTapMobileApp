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
const SAVE_AUDIO_KEY = '@thinktap/save_audio';

type SettingsState = {
  languageCode: AppLanguageCode;
  speechLocale: SpeechLocaleCode;
  /** Android 12 and below: keep the audio file instead of the live transcript. */
  saveAudioRecording: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLanguage: (code: AppLanguageCode) => Promise<void>;
  setSpeechLocale: (code: SpeechLocaleCode) => Promise<void>;
  setSaveAudioRecording: (value: boolean) => Promise<void>;
  language: () => AppLanguage;
  speechLanguage: () => SpeechLocale;
  tx: (key: Parameters<typeof t>[1]) => string;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  languageCode: DEFAULT_LANGUAGE,
  speechLocale: DEFAULT_SPEECH_LOCALE,
  saveAudioRecording: false,
  hydrated: false,

  hydrate: async () => {
    let languageCode: AppLanguageCode = DEFAULT_LANGUAGE;
    let speechLocale: SpeechLocaleCode = DEFAULT_SPEECH_LOCALE;
    let saveAudioRecording = false;

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

    try {
      saveAudioRecording = (await AsyncStorage.getItem(SAVE_AUDIO_KEY)) === 'true';
    } catch {
      // ignore
    }

    set({ languageCode, speechLocale, saveAudioRecording, hydrated: true });
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

  setSaveAudioRecording: async (value) => {
    set({ saveAudioRecording: value });
    await AsyncStorage.setItem(SAVE_AUDIO_KEY, value ? 'true' : 'false');
  },

  language: () => getLanguage(get().languageCode),

  speechLanguage: () => getSpeechLocale(get().speechLocale),

  tx: (key) => t(get().languageCode, key),
}));
