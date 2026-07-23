import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const WAKE_KEY = '@thinktap/wake_word_enabled';
let lastFireAt = 0;

type WakeWordState = {
  enabled: boolean;
  listening: boolean;
  /** True while the app is recording — wake listener must not hold the mic. */
  pausedForRecording: boolean;
  available: boolean | null;
  lastHeard: string;
  /** Incremented when wake phrase is detected — Home consumes this to start recording. */
  triggerToken: number;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setListening: (listening: boolean) => void;
  setPausedForRecording: (paused: boolean) => void;
  setAvailable: (available: boolean) => void;
  setLastHeard: (text: string) => void;
  fireWakeTrigger: () => void;
};

export const useWakeWordStore = create<WakeWordState>((set, get) => ({
  enabled: false,
  listening: false,
  pausedForRecording: false,
  available: null,
  lastHeard: '',
  triggerToken: 0,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(WAKE_KEY);
      set({ enabled: raw === 'true', hydrated: true });
    } catch {
      set({ enabled: false, hydrated: true });
    }
  },

  setEnabled: async (enabled) => {
    set({ enabled });
    await AsyncStorage.setItem(WAKE_KEY, enabled ? 'true' : 'false');
  },

  setListening: (listening) => set({ listening }),
  setPausedForRecording: (pausedForRecording) => set({ pausedForRecording }),
  setAvailable: (available) => set({ available }),
  setLastHeard: (text) => set({ lastHeard: text }),

  fireWakeTrigger: () => {
    const now = Date.now();
    if (now - lastFireAt < 3000) return;
    lastFireAt = now;
    // Pause immediately so the listen loop does not restart before Home starts recording.
    set({ triggerToken: get().triggerToken + 1, pausedForRecording: true });
  },
}));
