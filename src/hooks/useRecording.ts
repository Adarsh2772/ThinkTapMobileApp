import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

import { persistRecording } from '@/src/services/audioStorage';

/**
 * Voice-optimized recording (mono / speech-friendly) for better STT accuracy.
 * Closer to what Google / Whisper expect than stereo music presets.
 */
const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 96000,
  directory: 'document',
  isMeteringEnabled: false,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm;codecs=opus',
    bitsPerSecond: 96000,
  },
};

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping';

export function useRecording(options?: { onInterrupted?: () => void }) {
  const onInterruptedRef = useRef(options?.onInterrupted);
  onInterruptedRef.current = options?.onInterrupted;
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  /** Session is open (recording or paused) — expo-audio state can lag. */
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const userStoppingRef = useRef(false);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const busyRef = useRef(false);

  const recorder = useAudioRecorder(VOICE_RECORDING, (status) => {
    if (!activeRef.current || pausedRef.current || userStoppingRef.current) return;
    if (status.hasError || status.mediaServicesDidReset) {
      pausedRef.current = true;
      setPaused(true);
      onInterruptedRef.current?.();
    }
  });
  const recorderState = useAudioRecorderState(recorder, 200);

  const start = useCallback(async () => {
    if (busyRef.current) return null;
    if (activeRef.current || recorder.isRecording) {
      return true;
    }

    busyRef.current = true;
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is required to record ideas.');
        return null;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'doNotMix',
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      activeRef.current = true;
      pausedRef.current = false;
      setActive(true);
      setPaused(false);
      return true;
    } catch (e) {
      activeRef.current = false;
      pausedRef.current = false;
      setActive(false);
      setPaused(false);
      setError(e instanceof Error ? e.message : 'Could not start recording');
      return null;
    } finally {
      busyRef.current = false;
    }
  }, [recorder]);

  const pause = useCallback(async () => {
    if (busyRef.current) return false;
    if (!activeRef.current || pausedRef.current) return false;

    busyRef.current = true;
    setError(null);
    try {
      recorder.pause();
      pausedRef.current = true;
      setPaused(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pause recording');
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [recorder]);

  const resume = useCallback(async () => {
    if (busyRef.current) return false;
    if (!activeRef.current || !pausedRef.current) return false;

    busyRef.current = true;
    setError(null);
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'doNotMix',
      });
      // Resume the same prepared recording session (do not re-prepare).
      recorder.record();
      pausedRef.current = false;
      setPaused(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resume recording');
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (busyRef.current) return null;

    const shouldStop =
      activeRef.current || recorder.isRecording || recorderState.isRecording || pausedRef.current;
    if (!shouldStop) {
      return null;
    }

    busyRef.current = true;
    userStoppingRef.current = true;
    setStopping(true);
    try {
      // If paused, resume briefly so stop can finalize the file on some platforms.
      if (pausedRef.current) {
        try {
          recorder.record();
        } catch {
          // ignore — stop may still work from paused state
        }
      }

      try {
        await recorder.stop();
      } catch (e) {
        console.warn('recorder.stop() threw', e);
      }

      activeRef.current = false;
      pausedRef.current = false;
      setActive(false);
      setPaused(false);

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });

      // expo-audio can take a tick to publish the file URI after stop().
      let tempUri = recorder.uri ?? recorder.getStatus().url ?? null;
      if (!tempUri) {
        await new Promise((r) => setTimeout(r, 350));
        tempUri = recorder.uri ?? recorder.getStatus().url ?? null;
      }
      const status = recorder.getStatus();
      const millis = status.durationMillis || recorderState.durationMillis || 0;
      const seconds = Math.max(1, Math.round(millis / 1000));

      if (!tempUri) {
        setError('Recording file was not saved');
        return null;
      }

      const uri = await persistRecording(tempUri);
      return { uri, durationSec: seconds };
    } catch (e) {
      activeRef.current = false;
      pausedRef.current = false;
      setActive(false);
      setPaused(false);
      setError(e instanceof Error ? e.message : 'Could not stop recording');
      return null;
    } finally {
      setStopping(false);
      busyRef.current = false;
      userStoppingRef.current = false;
    }
  }, [recorder, recorderState.durationMillis, recorderState.isRecording]);

  const discard = useCallback(async () => {
    busyRef.current = true;
    userStoppingRef.current = true;
    try {
      if (activeRef.current || recorder.isRecording || recorderState.isRecording || pausedRef.current) {
        try {
          if (pausedRef.current) {
            try {
              recorder.record();
            } catch {
              // ignore
            }
          }
          await recorder.stop();
        } catch {
          // ignore
        }
      }
      activeRef.current = false;
      pausedRef.current = false;
      setActive(false);
      setPaused(false);
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      setError(null);
    } finally {
      busyRef.current = false;
      userStoppingRef.current = false;
    }
  }, [recorder, recorderState.isRecording]);

  const nativeRecording = recorderState.isRecording || recorder.isRecording;
  /** Any open take (actively recording or paused). */
  const inSession = active || nativeRecording || paused;

  const status: RecordingStatus = stopping
    ? 'stopping'
    : paused && active
      ? 'paused'
      : inSession && !paused
        ? 'recording'
        : 'idle';

  return {
    status,
    /** Session open (recording or paused). */
    isRecording: inSession,
    /** Actively capturing audio right now. */
    isActivelyRecording: inSession && !paused && status === 'recording',
    isPaused: paused && active,
    durationSec: Math.floor((recorderState.durationMillis || 0) / 1000),
    error,
    start,
    pause,
    resume,
    stop,
    discard,
  };
}
