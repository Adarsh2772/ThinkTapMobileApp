import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';
import { inferSpeechLocaleFromWakeText } from '@/src/features/wakeWord/phrases';

const WAKE_KEY = '@thinktap/wake_word_enabled';
const WAKE_ONBOARDING_KEY = '@thinktap/wake_word_onboarding_done';
let lastFireAt = 0;

type WakeWordState = {
  enabled: boolean;
  listening: boolean;
  /** True while the app is recording — wake listener must not hold the mic. */
  pausedForRecording: boolean;
  /** True while a take is open, wherever the user navigates. */
  captureActive: boolean;
  available: boolean | null;
  lastHeard: string;
  /** Locale inferred from the last wake phrase (e.g. Marathi command → mr-IN). */
  lastWakeLocale: SpeechLocaleCode | 'en-US' | null;
  /** Incremented when wake phrase is detected — Home consumes this to start recording. */
  triggerToken: number;
  /** False until the first-launch Hey Think Tap permission prompt is answered. */
  onboardingDone: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setOnboardingDone: (done?: boolean) => Promise<void>;
  setListening: (listening: boolean) => void;
  setPausedForRecording: (paused: boolean) => void;
  setCaptureActive: (active: boolean) => void;
  setAvailable: (available: boolean) => void;
  setLastHeard: (text: string) => void;
  clearLastWakeLocale: () => void;
  fireWakeTrigger: () => void;
};

export const useWakeWordStore = create<WakeWordState>((set, get) => ({
  enabled: false,
  listening: false,
  pausedForRecording: false,
  captureActive: false,
  available: null,
  lastHeard: '',
  lastWakeLocale: null,
  triggerToken: 0,
  onboardingDone: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const [enabledRaw, onboardingRaw] = await Promise.all([
        AsyncStorage.getItem(WAKE_KEY),
        AsyncStorage.getItem(WAKE_ONBOARDING_KEY),
      ]);
      set({
        enabled: enabledRaw === 'true',
        onboardingDone: onboardingRaw === 'true',
        hydrated: true,
      });
    } catch {
      set({ enabled: false, onboardingDone: false, hydrated: true });
    }
  },

  setEnabled: async (enabled) => {
    set({ enabled });
    await AsyncStorage.setItem(WAKE_KEY, enabled ? 'true' : 'false');
  },

  setOnboardingDone: async (done = true) => {
    set({ onboardingDone: done });
    await AsyncStorage.setItem(WAKE_ONBOARDING_KEY, done ? 'true' : 'false');
  },

  setListening: (listening) => set({ listening }),
  setPausedForRecording: (pausedForRecording) => set({ pausedForRecording }),
  setCaptureActive: (captureActive) => set({ captureActive }),
  setAvailable: (available) => set({ available }),
  setLastHeard: (text) => set({ lastHeard: text }),
  clearLastWakeLocale: () => set({ lastWakeLocale: null }),

  fireWakeTrigger: () => {
    const now = Date.now();
    if (now - lastFireAt < 3000) return;
    lastFireAt = now;
    const lastWakeLocale = inferSpeechLocaleFromWakeText(get().lastHeard);
    set({
      triggerToken: get().triggerToken + 1,
      pausedForRecording: true,
      lastWakeLocale,
    });
  },
}));
