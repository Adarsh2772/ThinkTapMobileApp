import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  APP_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguage,
  type AppLanguage,
  type AppLanguageCode,
} from '@/src/i18n/languages';
import { t } from '@/src/i18n/translations';

const LANGUAGE_KEY = '@thinktap/app_language';

type SettingsState = {
  languageCode: AppLanguageCode;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLanguage: (code: AppLanguageCode) => Promise<void>;
  language: () => AppLanguage;
  tx: (key: Parameters<typeof t>[1]) => string;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  languageCode: DEFAULT_LANGUAGE,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (raw && APP_LANGUAGES.some((l) => l.code === raw)) {
        set({ languageCode: raw as AppLanguageCode, hydrated: true });
        return;
      }
    } catch {
      // ignore
    }
    set({ languageCode: DEFAULT_LANGUAGE, hydrated: true });
  },

  setLanguage: async (code) => {
    set({ languageCode: code });
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  },

  language: () => getLanguage(get().languageCode),

  tx: (key) => t(get().languageCode, key),
}));
