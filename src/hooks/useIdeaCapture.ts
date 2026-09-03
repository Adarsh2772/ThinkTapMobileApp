import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { resolveCaptureMode } from '@/src/features/capture/captureMode';
import { useLanguageTranscript } from '@/src/hooks/useLanguageTranscript';
import { useRecording } from '@/src/hooks/useRecording';
import { useVoiceStopListener } from '@/src/hooks/useVoiceStopListener';
import { persistRecording } from '@/src/services/audioStorage';
import {
  abortLiveRecognition,
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
} from '@/src/services/languageTranscriptService';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

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
export function useIdeaCapture(options: { onCaptureFailed?: (message: string) => void } = {}) {
  const onCaptureFailedRef = useRef(options.onCaptureFailed);
  onCaptureFailedRef.current = options.onCaptureFailed;
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const preferSavedAudio = useSettingsStore((s) => s.saveAudioRecording);
  const audio = useRecording();
  // In audio-file mode the recorder owns the mic, so live speech-to-text is off
  // and the transcript comes from the saved file after the take.
  const audioOnly = resolveCaptureMode(preferSavedAudio) === 'audio-file';
  const fileRecorder = Platform.OS !== 'android' || audioOnly;
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
  const backgroundHoldRef = useRef(false);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);

  const fail = useCallback((message: string) => {
    lastErrorRef.current = message;
    setError(message);
  }, []);

  const getLastError = useCallback(() => lastErrorRef.current, []);

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
    enabled: active && !audioOnly,
    capturing: active && !paused && !audioOnly,
    onStopPhrase: () => {
      onVoiceStopRef.current?.();
    },
    onPausePhrase: () => {
      onVoicePauseRef.current?.();
    },
    onResumePhrase: () => {
      onVoiceResumeRef.current?.();
    },
    onUnavailable: (message) => {
      // Nothing can be captured, so close the take rather than leaving the
      // timer running over a recogniser that will never produce a word.
      if (fileRecorder) void audio.discard();
      activeRef.current = false;
      pausedRef.current = false;
      pausedAccumMsRef.current = 0;
      setActive(false);
      setPaused(false);
      setDurationSec(0);
      fail(message);
      onCaptureFailedRef.current?.(message);
    },
  });

  // iOS audio-file takes still need a spoken Stop — the recorder owns the mic,
  // so this listens in short bursts for the command only.
  useVoiceStopListener(
    audioOnly && Platform.OS !== 'android' && active && !paused && !stopping,
    () => {
      onVoiceStopRef.current?.();
    },
  );

  useEffect(() => {
    if (!active || paused) return;
    const tick = () => {
      if (backgroundHoldRef.current) {
        setDurationSec(Math.max(0, Math.floor(pausedAccumMsRef.current / 1000)));
        return;
      }
      const live = Date.now() - startedAtRef.current;
      setDurationSec(Math.max(0, Math.floor((pausedAccumMsRef.current + live) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, paused]);

  // Time spent in another app or on the lock screen is not recorded audio.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!activeRef.current || pausedRef.current) return;
      if (state !== 'active') {
        if (backgroundHoldRef.current) return;
        pausedAccumMsRef.current += Date.now() - startedAtRef.current;
        backgroundHoldRef.current = true;
        setDurationSec(Math.max(0, Math.floor(pausedAccumMsRef.current / 1000)));
        return;
      }
      if (!backgroundHoldRef.current) return;
      startedAtRef.current = Date.now();
      backgroundHoldRef.current = false;
    });
    return () => sub.remove();
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return true;

    const granted = await requestSpeechPermissions();
    if (!granted) {
      fail('Speech recognition permission is required to transcribe.');
      return null;
    }
    if (!audioOnly && !isSpeechRecognitionAvailable()) {
      fail('Speech recognition is unavailable on this device.');
      return null;
    }

    reset();
    abortLiveRecognition();
    if (fileRecorder) {
      const started = await audio.start();
      // Without this the UI would show "Recording" while nothing is captured.
      if (!started) {
        fail(audio.error ?? 'Could not start the recorder. Try again.');
        return null;
      }
    }
    lastErrorRef.current = null;
    setError(null);
    pausedAccumMsRef.current = 0;
    backgroundHoldRef.current = false;
    startedAtRef.current = Date.now();
    setDurationSec(0);
    pausedRef.current = false;
    activeRef.current = true;
    setPaused(false);
    setActive(true);
    return true;
  }, [reset, audio, audioOnly, fail, fileRecorder]);

  const pause = useCallback(async () => {
    if (!activeRef.current || pausedRef.current) return false;
    if (!backgroundHoldRef.current) {
      pausedAccumMsRef.current += Date.now() - startedAtRef.current;
    }
    backgroundHoldRef.current = false;
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
      if (!pausedRef.current && !backgroundHoldRef.current) {
        pausedAccumMsRef.current += Date.now() - startedAtRef.current;
      }
      const seconds = Math.max(1, Math.round(pausedAccumMsRef.current / 1000));
      const audioResult = fileRecorder ? await audio.stop() : null;
      if (!audioOnly) {
        // Let the engine flush its last words before reading the transcript.
        stopListening(false);
        await waitForIdle(2200);
        await new Promise((r) => setTimeout(r, 350));
      }

      const transcript = audioOnly ? '' : getFullTranscript();
      const speechUri = getAudioUri();
      const uri =
        audioResult?.uri || (speechUri ? await persistRecording(speechUri) : '');
      const durationSec = audioResult?.durationSec || seconds;

      if (!audioOnly) {
        abortLiveRecognition();
        await new Promise((r) => setTimeout(r, 450));
      }

      activeRef.current = false;
      pausedRef.current = false;
      pausedAccumMsRef.current = 0;
      backgroundHoldRef.current = false;
      setActive(false);
      setPaused(false);
      setDurationSec(0);

      if (!transcript.trim() && !uri) {
        fail(
          audioOnly
            ? 'The recording could not be saved. Try again.'
            : 'No speech was captured. Speak after the cue, then say “stop recording”.',
        );
        return null;
      }

      lastErrorRef.current = null;
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
  }, [
    audio,
    audioOnly,
    fail,
    fileRecorder,
    getAudioUri,
    getFullTranscript,
    speechLocale,
    stopListening,
    waitForIdle,
  ]);

  const discard = useCallback(async () => {
    stopListening(true);
    reset();
    if (fileRecorder) void audio.discard();
    activeRef.current = false;
    pausedRef.current = false;
    pausedAccumMsRef.current = 0;
    backgroundHoldRef.current = false;
    setActive(false);
    setPaused(false);
    setDurationSec(0);
    lastErrorRef.current = null;
    setError(null);
  }, [reset, stopListening, audio, fileRecorder]);

  // Published globally so the wake listener stays paused for the whole take,
  // even if the user navigates away from Home mid-recording.
  useEffect(() => {
    useWakeWordStore.getState().setCaptureActive(active || stopping);
  }, [active, stopping]);

  useEffect(() => {
    return () => {
      useWakeWordStore.getState().setCaptureActive(false);
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
    getLastError,
    status,
    start,
    pause,
    resume,
    stop,
    discard,
    setVoiceStopHandler,
    setVoicePauseHandler,
    setVoiceResumeHandler,
    supportsVoiceStop: !audioOnly || Platform.OS !== 'android',
    savesAudioFile: fileRecorder,
    captureMode: audioOnly ? ('audio-file' as const) : ('device' as const),
    liveTranscript: displayText,
    listening,
    speechLocale,
  };
}
