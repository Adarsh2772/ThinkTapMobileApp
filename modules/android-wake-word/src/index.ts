import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * Single-microphone capture API.
 *
 * WHY this replaced the old wake-word API: the previous module ran its own
 * SpeechRecognizer while expo-audio ran a second microphone session. Android
 * grants one session, so either the recording or the voice commands failed -
 * differently on every device and OS version.
 *
 * The native service now owns one AudioRecord and feeds the same frames to a
 * WAV writer and to an offline command recogniser. There is no microphone
 * handoff to get wrong, and no version-specific behaviour.
 */

export type WakePayload = { transcript: string };
export type PartialPayload = { transcript: string; isFinal: boolean };
export type ErrorPayload = { code: string; message: string };
export type ListeningPayload = { listening: boolean; paused: boolean };
export type CallStatePayload = { active: boolean };

export type RecordingState =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'discarded';

export type RecordingPayload = {
  state: RecordingState;
  /** Absolute path to the WAV. Empty except on 'stopped'. */
  path: string;
  /** Audio actually written, excluding paused time. */
  durationMs: number;
  /** True when a spoken command caused this transition, not a button. */
  fromVoice: boolean;
  /** The utterance that triggered it, for logging. */
  transcript: string;
};

type WakeEventMap = {
  onWakeDetected: WakePayload;
  onRecordingState: RecordingPayload;
  onPartialResult: PartialPayload;
  onError: ErrorPayload;
  onListeningChange: ListeningPayload;
  onCallState: CallStatePayload;
};

type NativeModule = {
  isSupported(): boolean;
  isModelReady(): boolean;
  isListening(): boolean;
  isRecording(): boolean;
  isPaused(): boolean;
  currentPath(): string | null;
  recordedMs(): number;
  hasMicPermission(): boolean;

  startListening(): Promise<boolean>;
  stopListening(): Promise<boolean>;

  startRecording(outputPath: string | null): Promise<boolean>;
  pauseRecording(): Promise<boolean>;
  resumeRecording(): Promise<boolean>;
  stopRecording(): Promise<boolean>;
  discardRecording(): Promise<boolean>;

  setCommandsEnabled(enabled: boolean): Promise<boolean>;
  areCommandsEnabled(): boolean;
  suspendMic(): Promise<boolean>;
  resumeMic(): Promise<boolean>;


  isCallActive(): boolean;
  startCallWatch(): Promise<boolean>;
  stopCallWatch(): Promise<boolean>;

  playRecordingStartCue(): Promise<boolean>;
  playRecordingStopCue(): Promise<boolean>;
  restoreRecognitionUi(): void;

  addListener(
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ): EventSubscription;
};

const Native: NativeModule | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeModule>('AndroidWakeWord')
    : null;

function addListener<E extends keyof WakeEventMap>(
  event: E,
  listener: (event: WakeEventMap[E]) => void,
): EventSubscription {
  if (!Native) return { remove() {} };
  return Native.addListener(
    event,
    listener as (event: Record<string, unknown>) => void,
  );
}

function safeBool(fn: (() => boolean) | undefined): boolean {
  if (!fn) return false;
  try {
    return fn();
  } catch {
    return false;
  }
}

export const AndroidWakeWord = {
  isSupported: (): boolean => safeBool(Native?.isSupported.bind(Native)),

  /** False until the offline model has unpacked. Recording works regardless. */
  isModelReady: (): boolean => safeBool(Native?.isModelReady.bind(Native)),

  isListening: (): boolean => safeBool(Native?.isListening.bind(Native)),
  isRecording: (): boolean => safeBool(Native?.isRecording.bind(Native)),
  isPaused: (): boolean => safeBool(Native?.isPaused.bind(Native)),
  isCallActive: (): boolean => safeBool(Native?.isCallActive.bind(Native)),
  hasMicPermission: (): boolean =>
    safeBool(Native?.hasMicPermission.bind(Native)),

  currentPath(): string | null {
    if (!Native) return null;
    try {
      return Native.currentPath();
    } catch {
      return null;
    }
  },

  recordedMs(): number {
    if (!Native) return 0;
    try {
      return Native.recordedMs();
    } catch {
      return 0;
    }
  },

  /** Begin idle listening for the wake phrase. Safe to call repeatedly. */
  async startListening(): Promise<boolean> {
    if (!Native) return false;
    return Native.startListening();
  },

  /** Release the microphone entirely. */
  async stopListening(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.stopListening();
    } catch {
      return false;
    }
  },

  /**
   * Start a take. Pass an absolute .wav path, or null to let the service pick
   * one. Listening starts automatically if it is not already running.
   */
  async startRecording(outputPath: string | null = null): Promise<boolean> {
    if (!Native) return false;
    return Native.startRecording(outputPath);
  },

  async pauseRecording(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.pauseRecording();
    } catch {
      return false;
    }
  },

  async resumeRecording(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.resumeRecording();
    } catch {
      return false;
    }
  },

  /** Stop and finalise. The path arrives on the 'stopped' event. */
  async stopRecording(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.stopRecording();
    } catch {
      return false;
    }
  },

  async discardRecording(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.discardRecording();
    } catch {
      return false;
    }
  },

  /**
   * Suspend or resume voice-command matching without releasing the microphone.
   *
   * WHY: playing a recording through the speaker feeds the app's own audio back
   * into its own microphone. A take containing "hey think tap stop" could stop
   * a live recording, and one containing "hey think tap start" could open a
   * take the user never asked for. Call with false before playback, true after.
   *
   * The recording itself is unaffected - only matching pauses.
   */
  async setCommandsEnabled(enabled: boolean): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.setCommandsEnabled(enabled);
    } catch {
      return false;
    }
  },

  areCommandsEnabled: (): boolean =>
    safeBool(Native?.areCommandsEnabled.bind(Native)),

  /**
   * True when Android will doze this app - the service will be killed and the
   * user will think the app is broken.
   */
  /**
   * Release the microphone without ending an open take.
   *
   * WHY not stopListening: that closes the WAV file and ends the recording.
   * This releases only AudioRecord, so the microphone indicator clears and
   * nothing is heard, while the take stays open and paused.
   */
  async suspendMic(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.suspendMic();
    } catch {
      return false;
    }
  },

  async resumeMic(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.resumeMic();
    } catch {
      return false;
    }
  },

  async startCallWatch(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.startCallWatch();
    } catch {
      return false;
    }
  },

  async stopCallWatch(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.stopCallWatch();
    } catch {
      return false;
    }
  },

  async playRecordingStartCue(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.playRecordingStartCue();
    } catch {
      return false;
    }
  },

  async playRecordingStopCue(): Promise<boolean> {
    if (!Native) return false;
    try {
      return await Native.playRecordingStopCue();
    } catch {
      return false;
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

  addListener,
};
