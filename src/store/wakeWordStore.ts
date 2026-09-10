import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const WAKE_KEY = '@thinktap/wake_word_enabled';
const WAKE_ONBOARDING_KEY = '@thinktap/wake_word_onboarding_done';
let lastFireAt = 0;
let lastStopAt = 0;

type WakeWordState = {
  enabled: boolean;
  listening: boolean;
  /** True while the app is recording — wake listener must not hold the mic. */
  pausedForRecording: boolean;
  /** True while a take is open, wherever the user navigates. */
  captureActive: boolean;
  /** True while a take is requested until it is open or has failed. */
  captureStarting: boolean;
  /** True while the in-app player is playing a saved take — wake STT must release the speaker. */
  playbackActive: boolean;
  available: boolean | null;
  lastHeard: string;
  /** Incremented when wake phrase is detected — Home consumes this to start recording. */
  triggerToken: number;
  /** Incremented when a spoken stop is heard while capturing in the background. */
  stopToken: number;
  /** Epoch ms of the last wake trigger — Home ignores stale tokens after 30s. */
  triggerAt: number;
  /** False until the first-launch Hey Think Tap permission prompt is answered. */
  onboardingDone: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setOnboardingDone: (done?: boolean) => Promise<void>;
  setListening: (listening: boolean) => void;
  setPausedForRecording: (paused: boolean) => void;
  setCaptureActive: (active: boolean) => void;
  setCaptureStarting: (starting: boolean) => void;
  setPlaybackActive: (active: boolean) => void;
  setAvailable: (available: boolean) => void;
  setLastHeard: (text: string) => void;
  fireWakeTrigger: () => void;
  fireStopTrigger: () => void;
};

export const useWakeWordStore = create<WakeWordState>((set, get) => ({
  enabled: false,
  listening: false,
  pausedForRecording: false,
  captureActive: false,
  captureStarting: false,
  playbackActive: false,
  available: null,
  lastHeard: '',
  triggerToken: 0,
  stopToken: 0,
  triggerAt: 0,
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
  setCaptureStarting: (captureStarting) => set({ captureStarting }),
  setPlaybackActive: (playbackActive) => set({ playbackActive }),
  setAvailable: (available) => set({ available }),
  setLastHeard: (text) => set({ lastHeard: text }),

  fireWakeTrigger: () => {
    const now = Date.now();
    if (now - lastFireAt < 1800) return;
    lastFireAt = now;
    set({
      triggerToken: get().triggerToken + 1,
      pausedForRecording: true,
      captureStarting: true,
      triggerAt: now,
    });
  },

  fireStopTrigger: () => {
    const now = Date.now();
    if (now - lastStopAt < 2000) return;
    lastStopAt = now;
    set({ stopToken: get().stopToken + 1 });
  },
}));
