import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';
import { Platform } from 'react-native';

export type WakePayload = { transcript: string };
export type PartialPayload = { transcript: string; isFinal: boolean };
export type ErrorPayload = { code: string; message: string };
export type ListeningPayload = { listening: boolean; paused: boolean };
export type PendingWake = { transcript: string; at: number } | null;

type WakeEventMap = {
  onWakeDetected: WakePayload;
  onPartialResult: PartialPayload;
  onError: ErrorPayload;
  onListeningChange: ListeningPayload;
};

type AndroidWakeWordNativeModule = {
  isSupported(): boolean;
  isRunning(): boolean;
  isPaused(): boolean;
  startService(): Promise<boolean>;
  stopService(): Promise<boolean>;
  stopServiceSilent(): Promise<boolean>;
  pauseService(): Promise<boolean>;
  resumeService(): Promise<boolean>;
  consumePendingWake(): Promise<PendingWake>;
  silenceRecognitionUi(): void;
  restoreRecognitionUi(): void;
  playRecordingStartCue(): Promise<boolean>;
  addListener(
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ): EventSubscription;
};

const Native: AndroidWakeWordNativeModule | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<AndroidWakeWordNativeModule>('AndroidWakeWord')
    : null;

function addListener<E extends keyof WakeEventMap>(
  event: E,
  listener: (event: WakeEventMap[E]) => void,
): EventSubscription {
  if (!Native) {
    return { remove() {} };
  }
  return Native.addListener(event, listener as (event: Record<string, unknown>) => void);
}

export const AndroidWakeWord = {
  isSupported(): boolean {
    if (!Native) return false;
    try {
      return Native.isSupported();
    } catch {
      return false;
    }
  },

  isRunning(): boolean {
    if (!Native) return false;
    try {
      return Native.isRunning();
    } catch {
      return false;
    }
  },

  isPaused(): boolean {
    if (!Native) return false;
    try {
      return Native.isPaused();
    } catch {
      return false;
    }
  },

  async startService(): Promise<boolean> {
    if (!Native) return false;
    return Native.startService();
  },

  async stopService(): Promise<boolean> {
    if (!Native) return false;
    return Native.stopService();
  },

  async stopServiceSilent(): Promise<boolean> {
    if (!Native) return false;
    try {
      return Native.stopServiceSilent();
    } catch {
      return Native.stopService();
    }
  },

  async pauseService(): Promise<boolean> {
    if (!Native) return false;
    return Native.pauseService();
  },

  async resumeService(): Promise<boolean> {
    if (!Native) return false;
    return Native.resumeService();
  },

  async consumePendingWake(): Promise<PendingWake> {
    if (!Native) return null;
    return Native.consumePendingWake();
  },

  silenceRecognitionUi(): void {
    if (!Native) return;
    try {
      Native.silenceRecognitionUi();
    } catch {
      // ignore
    }
  },

  restoreRecognitionUi(): void {
    if (!Native) return;
    try {
      Native.restoreRecognitionUi();
    } catch {
      // ignore
    }
  },

  async playRecordingStartCue(): Promise<boolean> {
    if (!Native) return false;
    try {
      return Native.playRecordingStartCue();
    } catch {
      return false;
    }
  },

  addListener,
};
