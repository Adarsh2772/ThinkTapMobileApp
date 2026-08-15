import { useCallback, useEffect, useRef } from 'react';

import { useLanguageTranscript } from '@/src/hooks/useLanguageTranscript';
import { useRecording } from '@/src/hooks/useRecording';
import { useSettingsStore } from '@/src/store/settingsStore';

type CaptureResult = {
  uri: string;
  durationSec: number;
  transcript: string;
  speechLocale: string;
};

/**
 * Records with expo-audio and runs OS speech recognition in parallel
 * (Indian locale from settings). Voice "Stop" is handled by the same STT stream.
 * Supports pause / resume of the same take.
 */
export function useIdeaCapture() {
  const audio = useRecording();
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const onVoiceStopRef = useRef<(() => void) | null>(null);

  const setVoiceStopHandler = useCallback((handler: (() => void) | null) => {
    onVoiceStopRef.current = handler;
  }, []);

  const {
    displayText,
    error: sttError,
    getFullTranscript,
    stopListening,
    reset,
  } = useLanguageTranscript({
    speechLocale,
    // Only listen while actively recording — pause STT when the take is paused.
    enabled: audio.isActivelyRecording,
    onStopPhrase: () => {
      onVoiceStopRef.current?.();
    },
  });

  const start = useCallback(async () => {
    reset();
    return audio.start();
  }, [audio, reset]);

  const pause = useCallback(async () => {
    stopListening(true);
    return audio.pause();
  }, [audio, stopListening]);

  const resume = useCallback(async () => {
    return audio.resume();
  }, [audio]);

  const stop = useCallback(async (): Promise<CaptureResult | null> => {
    const transcript = getFullTranscript();
    stopListening(true);
    const result = await audio.stop();
    if (!result) return null;
    return {
      uri: result.uri,
      durationSec: result.durationSec,
      transcript,
      speechLocale,
    };
  }, [audio, getFullTranscript, speechLocale, stopListening]);

  const discard = useCallback(async () => {
    stopListening(true);
    reset();
    await audio.discard();
  }, [audio, reset, stopListening]);

  useEffect(() => {
    return () => {
      onVoiceStopRef.current = null;
    };
  }, []);

  return {
    isRecording: audio.isRecording,
    isActivelyRecording: audio.isActivelyRecording,
    isPaused: audio.isPaused,
    durationSec: audio.durationSec,
    error: audio.error ?? sttError,
    status: audio.status,
    start,
    pause,
    resume,
    stop,
    discard,
    setVoiceStopHandler,
    supportsVoiceStop: true,
    captureMode: 'device' as const,
    liveTranscript: displayText,
    speechLocale,
  };
}
