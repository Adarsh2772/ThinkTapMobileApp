import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useLanguageTranscript } from '@/src/hooks/useLanguageTranscript';
import { useRecording } from '@/src/hooks/useRecording';
import { persistRecording } from '@/src/services/audioStorage';
import {
  abortLiveRecognition,
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
} from '@/src/services/languageTranscriptService';
import { useSettingsStore } from '@/src/store/settingsStore';

type CaptureResult = {
  uri: string;
  durationSec: number;
  transcript: string;
  speechLocale: string;
};

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping';

/**
 * Idea capture uses OS speech recognition as the microphone owner on Android.
 * Running expo-audio in parallel steals the mic, so the take is empty and
 * spoken “stop recording” is never heard.
 */
export function useIdeaCapture() {
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const audio = useRecording();
  const fileRecorder = Platform.OS !== 'android';
  const onVoiceStopRef = useRef<(() => void) | null>(null);
  const onVoicePauseRef = useRef<(() => void) | null>(null);
  const onVoiceResumeRef = useRef<(() => void) | null>(null);

  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startedAtRef = useRef(0);
  const pausedAccumMsRef = useRef(0);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);

  const setVoiceStopHandler = useCallback((handler: (() => void) | null) => {
    onVoiceStopRef.current = handler;
  }, []);
  const setVoicePauseHandler = useCallback((handler: (() => void) | null) => {
    onVoicePauseRef.current = handler;
  }, []);
  const setVoiceResumeHandler = useCallback((handler: (() => void) | null) => {
    onVoiceResumeRef.current = handler;
  }, []);

  const {
    displayText,
    error: sttError,
    listening,
    getFullTranscript,
    getAudioUri,
    waitForIdle,
    stopListening,
    reset,
  } = useLanguageTranscript({
    speechLocale,
    enabled: active,
    capturing: active && !paused,
    onStopPhrase: () => {
      onVoiceStopRef.current?.();
    },
    onPausePhrase: () => {
      onVoicePauseRef.current?.();
    },
    onResumePhrase: () => {
      onVoiceResumeRef.current?.();
    },
  });

  useEffect(() => {
    if (!active || paused) return;
    const tick = () => {
      const live = Date.now() - startedAtRef.current;
      setDurationSec(Math.max(0, Math.floor((pausedAccumMsRef.current + live) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, paused]);

  const start = useCallback(async () => {
    if (activeRef.current) return true;

    const granted = await requestSpeechPermissions();
    if (!granted) {
      setError('Speech recognition permission is required to transcribe.');
      return null;
    }
    if (!isSpeechRecognitionAvailable()) {
      setError('Speech recognition is unavailable on this device.');
      return null;
    }

    reset();
    abortLiveRecognition();
    if (fileRecorder) {
      await audio.start();
    }
    setError(null);
    pausedAccumMsRef.current = 0;
    startedAtRef.current = Date.now();
    setDurationSec(0);
    pausedRef.current = false;
    activeRef.current = true;
    setPaused(false);
    setActive(true);
    return true;
  }, [reset, audio, fileRecorder]);

  const pause = useCallback(async () => {
    if (!activeRef.current || pausedRef.current) return false;
    pausedAccumMsRef.current += Date.now() - startedAtRef.current;
    pausedRef.current = true;
    setPaused(true);
    if (fileRecorder) void audio.pause();
    return true;
  }, [audio, fileRecorder]);

  const resume = useCallback(async () => {
    if (!activeRef.current || !pausedRef.current) return false;
    startedAtRef.current = Date.now();
    pausedRef.current = false;
    setPaused(false);
    if (fileRecorder) void audio.resume();
    return true;
  }, [audio, fileRecorder]);

  const stop = useCallback(async (): Promise<CaptureResult | null> => {
    if (!activeRef.current) return null;
    setStopping(true);
    try {
      if (!pausedRef.current) {
        pausedAccumMsRef.current += Date.now() - startedAtRef.current;
      }
      const seconds = Math.max(1, Math.round(pausedAccumMsRef.current / 1000));
      const audioResult = fileRecorder ? await audio.stop() : null;
      stopListening(false);
      await waitForIdle(2200);
      await new Promise((r) => setTimeout(r, 350));

      const transcript = getFullTranscript();
      const speechUri = getAudioUri();
      const uri =
        audioResult?.uri || (speechUri ? await persistRecording(speechUri) : '');
      const durationSec = audioResult?.durationSec || seconds;

      abortLiveRecognition();
      await new Promise((r) => setTimeout(r, 450));

      activeRef.current = false;
      pausedRef.current = false;
      pausedAccumMsRef.current = 0;
      setActive(false);
      setPaused(false);
      setDurationSec(0);

      if (!transcript.trim()) {
        setError('No speech detected in this recording. Try speaking more clearly.');
        return null;
      }

      setError(null);
      return {
        uri,
        durationSec,
        transcript,
        speechLocale,
      };
    } finally {
      setStopping(false);
    }
  }, [audio, fileRecorder, getAudioUri, getFullTranscript, speechLocale, stopListening, waitForIdle]);

  const discard = useCallback(async () => {
    stopListening(true);
    reset();
    if (fileRecorder) void audio.discard();
    activeRef.current = false;
    pausedRef.current = false;
    pausedAccumMsRef.current = 0;
    setActive(false);
    setPaused(false);
    setDurationSec(0);
    setError(null);
  }, [reset, stopListening, audio, fileRecorder]);

  useEffect(() => {
    return () => {
      onVoiceStopRef.current = null;
      onVoicePauseRef.current = null;
      onVoiceResumeRef.current = null;
    };
  }, []);

  const status: RecordingStatus = stopping
    ? 'stopping'
    : paused && active
      ? 'paused'
      : active
        ? 'recording'
        : 'idle';

  return {
    isRecording: active,
    isActivelyRecording: active && !paused,
    isPaused: paused && active,
    durationSec,
    error: error ?? sttError,
    status,
    start,
    pause,
    resume,
    stop,
    discard,
    setVoiceStopHandler,
    setVoicePauseHandler,
    setVoiceResumeHandler,
    supportsVoiceStop: true,
    captureMode: 'device' as const,
    liveTranscript: displayText,
    listening,
    speechLocale,
  };
}
