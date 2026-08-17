import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

const API_KEY_SECURE = 'thinktap_stt_api_key';

export type SttProvider = 'groq' | 'openai' | null;

type TranscriptionMode = 'live' | 'demo';

type AiConfigState = {
  apiKey: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setApiKey: (key: string | null) => Promise<void>;
  getApiKey: () => string | null;
  provider: () => SttProvider;
  mode: () => TranscriptionMode;
};

function detectProvider(key: string | null | undefined): SttProvider {
  if (!key) return null;
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-')) return 'openai';
  // Default unknown keys to Groq-compatible OpenAI-style if user pastes other free keys later
  return 'groq';
}

function envApiKey(): string | null {
  const groq = process.env.EXPO_PUBLIC_GROQ_API_KEY?.trim();
  if (groq) return groq;
  const openai = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();
  return openai || null;
}

function forceMock(): boolean {
  return process.env.EXPO_PUBLIC_USE_MOCK_AI === 'true';
}

export const useAiConfigStore = create<AiConfigState>((set, get) => ({
  apiKey: null,
  hydrated: false,

  hydrate: async () => {
    try {
      if (Platform.OS === 'web') {
        set({ apiKey: envApiKey(), hydrated: true });
        return;
      }
      const stored = await SecureStore.getItemAsync(API_KEY_SECURE);
      set({ apiKey: stored?.trim() || envApiKey(), hydrated: true });
    } catch {
      set({ apiKey: envApiKey(), hydrated: true });
    }
  },

  setApiKey: async (key) => {
    const cleaned = key?.trim() || null;
    set({ apiKey: cleaned ?? envApiKey() });
    if (Platform.OS === 'web') return;
    if (cleaned) {
      await SecureStore.setItemAsync(API_KEY_SECURE, cleaned);
    } else {
      await SecureStore.deleteItemAsync(API_KEY_SECURE);
    }
  },

  getApiKey: () => {
    if (forceMock()) return null;
    return get().apiKey || envApiKey();
  },

  provider: () => detectProvider(get().getApiKey()),

  mode: () => (get().getApiKey() ? 'live' : 'demo'),
}));

export { detectProvider };
