import { create } from 'zustand';

type PendingRecording = {
  audioUri: string;
  durationSec: number;
  /** OS speech-to-text result captured during recording (no AI). */
  transcript: string;
  /** BCP-47 locale used for OS STT, e.g. hi-IN */
  speechLocale: string;
};

type PendingRecordingState = {
  pending: PendingRecording | null;
  setPending: (pending: PendingRecording) => void;
  clearPending: () => void;
};

/**
 * Holds the latest recording while Processing runs.
 * Do NOT pass file:// URIs through Expo Router params — they get corrupted.
 */
export const usePendingRecordingStore = create<PendingRecordingState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clearPending: () => set({ pending: null }),
}));
