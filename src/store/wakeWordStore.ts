import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';
import { inferSpeechLocaleFromWakeText } from '@/src/features/wakeWord/phrases';

const WAKE_KEY = '@thinktap/wake_word_enabled';
const WAKE_ONBOARDING_KEY = '@thinktap/wake_word_onboarding_done';
let lastFireAt = 0;

type WakeWordState = {
  /** User preference — persisted. Does NOT start the mic by itself. */
  enabled: boolean;
  /**
   * Mic / SpeechRecognizer may run only after an explicit user action
   * (toggle ON, onboarding Enable). Always false on cold launch.
   */
  listeningArmed: boolean;
  listening: boolean;
  pausedForRecording: boolean;
  captureActive: boolean;
  available: boolean | null;
  lastHeard: string;
  lastWakeLocale: SpeechLocaleCode | 'en-US' | null;
  triggerToken: number;
  onboardingDone: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  armListening: () => void;
  disarmListening: () => void;
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
  listeningArmed: false,
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
        // Preference restored; mic stays off until user explicitly arms listening.
        listeningArmed: false,
        onboardingDone: onboardingRaw === 'true',
        hydrated: true,
      });
    } catch {
      set({ enabled: false, listeningArmed: false, onboardingDone: false, hydrated: true });
    }
  },

  setEnabled: async (enabled) => {
    if (enabled) {
      set({ enabled: true, listeningArmed: true });
    } else {
      set({ enabled: false, listeningArmed: false, listening: false });
    }
    await AsyncStorage.setItem(WAKE_KEY, enabled ? 'true' : 'false');
  },

  armListening: () => {
    if (get().enabled) set({ listeningArmed: true });
  },

  disarmListening: () => set({ listeningArmed: false, listening: false }),

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
    console.log('[VOICE] wake word detected transcript=', get().lastHeard);
    set({
      triggerToken: get().triggerToken + 1,
      pausedForRecording: true,
      lastWakeLocale,
    });
  },
}));

/** True when wake mic / SpeechRecognizer is allowed to run. */
export function shouldRunWakeListening(): boolean {
  const s = useWakeWordStore.getState();
  return (
    s.enabled &&
    s.listeningArmed &&
    !s.pausedForRecording &&
    !s.captureActive
  );
}
