import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { resolveCaptureMode } from '@/src/features/capture/captureMode';
import { AndroidWakeWord } from 'android-wake-word';
import { useLanguageTranscript } from '@/src/hooks/useLanguageTranscript';
import { useRecording } from '@/src/hooks/useRecording';
import { useVoiceStopListener } from '@/src/hooks/useVoiceStopListener';
import { persistRecording, probeAudioDurationSec } from '@/src/services/audioStorage';
import { looksLikeWhisperHallucination } from '@/src/services/aiService';
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

const SILENCE_PAUSE_MS = 10_000;
const INACTIVE_PAUSE_MS = 450;
const SPEECH_METER_THRESHOLD = -42;

/**
 * Idea capture uses OS speech recognition as the microphone owner on Android.
 * Running expo-audio in parallel steals the mic, so the take is empty and
 * spoken “stop recording” is never heard.
 */
export function useIdeaCapture(
  options: {
    onCaptureFailed?: (message: string) => void;
    onInterrupted?: () => void;
    onSilencePause?: () => void;
  } = {},
) {
  const onCaptureFailedRef = useRef(options.onCaptureFailed);
  onCaptureFailedRef.current = options.onCaptureFailed;
  const onInterruptedRef = useRef(options.onInterrupted);
  onInterruptedRef.current = options.onInterrupted;
  const onSilencePauseRef = useRef(options.onSilencePause);
  onSilencePauseRef.current = options.onSilencePause;
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const preferSavedAudio = useSettingsStore((s) => s.saveAudioRecording);

  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [callHold, setCallHold] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startedAtRef = useRef(0);
  const pausedAccumMsRef = useRef(0);
  const backgroundHoldRef = useRef(false);
  const lifecyclePausedRef = useRef(false);
  const interruptionPausedRef = useRef(false);
  const silenceHoldRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  const pauseRef = useRef<(reason?: 'user' | 'lifecycle' | 'interruption' | 'silence') => Promise<boolean>>(
    async () => false,
  );
  const resumeRef = useRef<() => Promise<boolean>>(async () => false);
  const lastInterruptAtRef = useRef(0);
  const stoppingNowRef = useRef(false);
  const onVoiceStopRef = useRef<(() => void) | null>(null);
  const onVoicePauseRef = useRef<(() => void) | null>(null);
  const onVoiceResumeRef = useRef<(() => void) | null>(null);

  const notifyInterrupted = () => {
    if (stoppingNowRef.current) return;
    const now = Date.now();
    if (now - lastInterruptAtRef.current < 1500) return;
    lastInterruptAtRef.current = now;
    onInterruptedRef.current?.();
  };

  const audio = useRecording({
    onInterrupted: () => {
      if (stoppingNowRef.current) return;
      interruptionPausedRef.current = true;
      lifecyclePausedRef.current = false;
      silenceHoldRef.current = false;
      setCallHold(true);
      void pauseRef.current('interruption');
      notifyInterrupted();
    },
  });
  // In audio-file mode the recorder owns the mic, so live speech-to-text is off
  // and the transcript comes from the saved file after the take.
  const audioOnly = resolveCaptureMode(preferSavedAudio) === 'audio-file';
  const fileRecorder = Platform.OS !== 'android' || audioOnly;
  const meteringRef = useRef(-160);
  meteringRef.current = audio.metering;

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
    enabled: active && !audioOnly && !callHold,
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
    onInterrupted: () => {
      if (stoppingNowRef.current) return;
      interruptionPausedRef.current = true;
      lifecyclePausedRef.current = false;
      silenceHoldRef.current = false;
      setCallHold(true);
      void pauseRef.current('interruption');
      notifyInterrupted();
    },
    onSpeechActivity: () => {
      lastSpeechAtRef.current = Date.now();
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
    if (!active || paused || stopping) return;
    const tick = () => {
      if (stoppingNowRef.current || backgroundHoldRef.current) {
        setDurationSec(Math.max(0, Math.floor(pausedAccumMsRef.current / 1000)));
        return;
      }
      const live = Date.now() - startedAtRef.current;
      setDurationSec(Math.max(0, Math.floor((pausedAccumMsRef.current + live) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, paused, stopping]);

  // Time spent in another app or on the lock screen is not recorded audio.
  // Android `inactive` is often an app-switch, but Stop tap is a brief blip —
  // debounce it so Stop does not pause-then-resume the take.
  useEffect(() => {
    const clearLeaveTimer = () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
    const pauseForLeave = () => {
      leaveTimerRef.current = null;
      if (!activeRef.current || stoppingNowRef.current || pausedRef.current) return;
      if (interruptionPausedRef.current || silenceHoldRef.current) return;
      lifecyclePausedRef.current = true;
      void pauseRef.current('lifecycle');
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (!activeRef.current || stoppingNowRef.current) {
        clearLeaveTimer();
        return;
      }
      if (state === 'background') {
        clearLeaveTimer();
        pauseForLeave();
        return;
      }
      if (state === 'inactive') {
        if (pausedRef.current || interruptionPausedRef.current) {
          clearLeaveTimer();
          return;
        }
        clearLeaveTimer();
        leaveTimerRef.current = setTimeout(pauseForLeave, INACTIVE_PAUSE_MS);
        return;
      }
      if (state !== 'active') return;
      clearLeaveTimer();
      if (silenceHoldRef.current || interruptionPausedRef.current) return;
      if (lifecyclePausedRef.current && pausedRef.current) {
        lifecyclePausedRef.current = false;
        void resumeRef.current();
      }
    });
    return () => {
      clearLeaveTimer();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!active || paused || stopping) return;
    const id = setInterval(() => {
      if (stoppingNowRef.current || pausedRef.current || !activeRef.current) return;
      if (fileRecorder) {
        const meter = meteringRef.current;
        if (typeof meter === 'number' && meter > SPEECH_METER_THRESHOLD) {
          lastSpeechAtRef.current = Date.now();
        }
      }
      if (Date.now() - lastSpeechAtRef.current < SILENCE_PAUSE_MS) return;
      silenceHoldRef.current = true;
      lifecyclePausedRef.current = false;
      void pauseRef.current('silence');
      onSilencePauseRef.current?.();
    }, 500);
    return () => clearInterval(id);
  }, [active, paused, stopping, fileRecorder]);

  // Incoming / outgoing calls (cellular or VoIP) must pause the take and
  // must not auto-resume when the call ends.
  useEffect(() => {
    if (!active || Platform.OS !== 'android' || !AndroidWakeWord.isSupported()) {
      return;
    }
    let cancelled = false;
    const sub = AndroidWakeWord.addListener('onCallState', (event) => {
      if (!event.active || stoppingNowRef.current || !activeRef.current) return;
      interruptionPausedRef.current = true;
      lifecyclePausedRef.current = false;
      silenceHoldRef.current = false;
      setCallHold(true);
      if (!pausedRef.current) {
        void pauseRef.current('interruption');
      }
      notifyInterrupted();
    });
    void AndroidWakeWord.startCallWatch().then((alreadyInCall) => {
      if (cancelled || !alreadyInCall || stoppingNowRef.current || !activeRef.current) return;
      interruptionPausedRef.current = true;
      lifecyclePausedRef.current = false;
      silenceHoldRef.current = false;
      setCallHold(true);
      if (!pausedRef.current) {
        void pauseRef.current('interruption');
      }
      notifyInterrupted();
    });
    return () => {
      cancelled = true;
      sub.remove();
      void AndroidWakeWord.stopCallWatch();
    };
  }, [active]);

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
    lifecyclePausedRef.current = false;
    interruptionPausedRef.current = false;
    silenceHoldRef.current = false;
    lastSpeechAtRef.current = Date.now();
    setCallHold(false);
    startedAtRef.current = Date.now();
    setDurationSec(0);
    pausedRef.current = false;
    activeRef.current = true;
    setPaused(false);
    setActive(true);
    return true;
  }, [reset, audio, audioOnly, fail, fileRecorder]);

  const pause = useCallback(async (_reason?: 'user' | 'lifecycle' | 'interruption' | 'silence') => {
    if (!activeRef.current || pausedRef.current) return false;
    if (!backgroundHoldRef.current) {
      pausedAccumMsRef.current += Date.now() - startedAtRef.current;
    }
    backgroundHoldRef.current = false;
    pausedRef.current = true;
    setPaused(true);
    setDurationSec(Math.max(0, Math.floor(pausedAccumMsRef.current / 1000)));
    if (fileRecorder) void audio.pause();
    return true;
  }, [audio, fileRecorder]);
  pauseRef.current = pause;

  const resume = useCallback(async () => {
    if (!activeRef.current || !pausedRef.current) return false;
    if (Platform.OS === 'android' && AndroidWakeWord.isCallActive()) {
      interruptionPausedRef.current = true;
      setCallHold(true);
      notifyInterrupted();
      return false;
    }
    interruptionPausedRef.current = false;
    lifecyclePausedRef.current = false;
    silenceHoldRef.current = false;
    setCallHold(false);
    lastSpeechAtRef.current = Date.now();
    startedAtRef.current = Date.now();
    pausedRef.current = false;
    setPaused(false);
    if (fileRecorder) void audio.resume();
    return true;
  }, [audio, fileRecorder]);
  resumeRef.current = resume;

  const stop = useCallback(async (): Promise<CaptureResult | null> => {
    if (!activeRef.current || stoppingNowRef.current) return null;
    stoppingNowRef.current = true;
    setStopping(true);
    try {
      if (!pausedRef.current && !backgroundHoldRef.current) {
        pausedAccumMsRef.current += Date.now() - startedAtRef.current;
      }
      // Freeze the clock so Stop cannot add elapsed time twice (20s → 40s).
      backgroundHoldRef.current = true;
      const seconds = Math.max(1, Math.round(pausedAccumMsRef.current / 1000));
      setDurationSec(seconds);
      if (!audioOnly) {
        // Abort immediately so Stop cannot lose a race with STT restarts.
        stopListening(true);
      }
      const audioResult = fileRecorder ? await audio.stop() : null;
      if (!audioOnly) {
        await waitForIdle(400);
      }

      const speechUri = getAudioUri();
      const uri =
        audioResult?.uri || (speechUri ? await persistRecording(speechUri) : '');
      let transcript = audioOnly ? '' : getFullTranscript();
      if (looksLikeWhisperHallucination(transcript)) {
        transcript = '';
      }
      let durationSec = seconds;
      if (uri) {
        const probed = await probeAudioDurationSec(uri, 800);
        if (probed && probed > 0) {
          durationSec = probed;
        } else if (audioResult?.durationSec && audioResult.durationSec > 0) {
          durationSec = Math.min(audioResult.durationSec, seconds);
        }
      }

      if (!audioOnly) {
        abortLiveRecognition();
      }

      activeRef.current = false;
      pausedRef.current = false;
      pausedAccumMsRef.current = 0;
      backgroundHoldRef.current = false;
      lifecyclePausedRef.current = false;
      interruptionPausedRef.current = false;
      silenceHoldRef.current = false;
      setCallHold(false);
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
      stoppingNowRef.current = false;
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
    stoppingNowRef.current = true;
    stopListening(true);
    reset();
    if (fileRecorder) void audio.discard();
    activeRef.current = false;
    pausedRef.current = false;
    pausedAccumMsRef.current = 0;
    backgroundHoldRef.current = false;
    lifecyclePausedRef.current = false;
    interruptionPausedRef.current = false;
    silenceHoldRef.current = false;
    setCallHold(false);
    setActive(false);
    setPaused(false);
    setDurationSec(0);
    lastErrorRef.current = null;
    setError(null);
    stoppingNowRef.current = false;
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
