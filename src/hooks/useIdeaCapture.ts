import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { resolveCaptureMode } from '@/src/features/capture/captureMode';
import { matchesStopPhrase } from '@/src/features/wakeWord/phrases';
import { AndroidWakeWord } from 'android-wake-word';
import { useLanguageTranscript } from '@/src/hooks/useLanguageTranscript';
import { useRecording } from '@/src/hooks/useRecording';
import { useVoiceStopListener } from '@/src/hooks/useVoiceStopListener';
import { persistRecording } from '@/src/services/audioStorage';
import { looksLikeWhisperHallucination } from '@/src/services/aiService';
import {
  abortLiveRecognition,
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
  stripTrailingStopCommand,
} from '@/src/services/languageTranscriptService';
import { listenOnceForStopPhrase } from '@/src/services/voiceStopOnce';
import { setAudioModeAsync } from 'expo-audio';
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
/** Android often flickers `inactive` on tap / toast / FGS pause — wait before treating it as leave. */
const INACTIVE_PAUSE_MS = 1200;
/**
 * After Start, ignore `inactive` lifecycle pauses so the take does not
 * pause→resume during mic handoff + STT settle (felt like a 2s false pause).
 */
const START_LIFECYCLE_GRACE_MS = 2800;
const SPEECH_METER_THRESHOLD = -42;
const MIC_SHARE_KEY = '@thinktap/mic_share_supported';
const MIC_SHARE_FAIL_THRESHOLD = 3;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Prefer wall-clock length; ignore a 1–2s probe on an unflushed file. */
function resolveCaptureDurationSec(
  wallClockSec: number,
  probed: number | null,
  recorderSec?: number,
): number {
  const wall = Math.max(1, Math.round(wallClockSec));
  const usable = (candidate: number) => candidate >= wall * 0.8;
  if (probed && probed > 0 && usable(probed)) {
    return probed;
  }
  if (recorderSec && recorderSec > 0 && usable(recorderSec)) {
    return Math.min(recorderSec, wall);
  }
  return wall;
}

type MicShareCache = {
  supported: boolean;
  appVersion: string;
  osVersion: string;
};

function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

function currentOsVersion(): string {
  return `${Platform.OS}-${String(Platform.Version)}`;
}

async function writeMicShareCache(supported: boolean): Promise<void> {
  const payload: MicShareCache = {
    supported,
    appVersion: currentAppVersion(),
    osVersion: currentOsVersion(),
  };
  try {
    await AsyncStorage.setItem(MIC_SHARE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

async function readMicShareCache(): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(MIC_SHARE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MicShareCache;
    if (
      parsed.appVersion !== currentAppVersion() ||
      parsed.osVersion !== currentOsVersion()
    ) {
      return null;
    }
    return parsed.supported;
  } catch {
    return null;
  }
}

/**
 * expo-audio always writes the file, on every Android version. The take
 * must survive Stop even if the recognizer, the network, or the AI layer fails.
 * Live transcription is attempted in parallel; mic-sharing failure is detected
 * at runtime rather than guessed from Platform.Version.
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
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const androidFgsStop =
    Platform.OS === 'android' && AndroidWakeWord.isSupported() && wakeEnabled;

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
  const micShareFailedRef = useRef(false);
  const consecutiveMicShareFailsRef = useRef(0);
  const [micShareFailed, setMicShareFailed] = useState(false);
  const commandListenRef = useRef(false);
  const sawSpeechRef = useRef(false);
  /** STT committed at least one result this take — rules out silent mic starvation. */
  const sttHeardSpeechRef = useRef(false);
  /** When metering first heard speech this take while STT still had no results. */
  const meterSpeechSinceRef = useRef(0);
  const lastCommandListenAtRef = useRef(0);
  const spokenStopGuardRef = useRef(false);

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
  /**
   * WHY: expo-audio always writes the file, on every Android version. The take
   * must survive Stop even if the recognizer, the network, or the AI layer fails.
   * No Platform.Version check — capability is detected at runtime below.
   */
  const fileRecorder = true;
  const meteringRef = useRef(-160);
  meteringRef.current = audio.metering;

  /**
   * WHY: some OEMs (ColorOS / older Android) let MediaRecorder and
   * SpeechRecognizer "start" together, but only the recorder gets samples.
   * STT then loops on no-speech instead of audio-capture. Free the mic so
   * live captions in the selected language can continue.
   */
  const nudgeListeningRef = useRef<() => void>(() => {});
  const preferLiveCaptionsOverFile = useCallback(() => {
    if (!fileRecorder || !activeRef.current) return;
    consecutiveMicShareFailsRef.current += 1;
    micShareFailedRef.current = true;
    setMicShareFailed(true);
    if (consecutiveMicShareFailsRef.current >= MIC_SHARE_FAIL_THRESHOLD) {
      void writeMicShareCache(false);
    }
    if (__DEV__) {
      console.log('[CAPTURE] mic sharing unsupported — prefer live STT captions');
    }
    void audio.suspendMic();
    // Restart STT on the freed mic — the old session was listening to silence.
    nudgeListeningRef.current();
  }, [audio, fileRecorder]);

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
    nudgeListening,
    reset,
  } = useLanguageTranscript({
    speechLocale,
    // Live captions in the selected speech locale. Wake FGS is paused during a
    // take, so this no longer stays off whenever Hey Think Tap is enabled.
    enabled: active && !audioOnly && !callHold,
    capturing: active && !paused && !audioOnly && !callHold,
    onStopPhrase: () => {
      onVoiceStopRef.current?.();
    },
    onPausePhrase: () => {
      onVoicePauseRef.current?.();
    },
    onResumePhrase: () => {
      onVoiceResumeRef.current?.();
    },
    onSttError: (code: string) => {
      const contention = code === 'audio-capture' || code === 'client' || code === 'busy';
      // Meter heard speech but STT never did → recorder owns the mic exclusively.
      const silentStarvation =
        (code === 'no-speech' || code === 'speech-timeout') &&
        fileRecorder &&
        activeRef.current &&
        !micShareFailedRef.current &&
        sawSpeechRef.current &&
        !sttHeardSpeechRef.current;
      if ((contention || silentStarvation) && fileRecorder && activeRef.current) {
        if (!micShareFailedRef.current) {
          // Silent starvation is definitive (meter vs STT); cache immediately so
          // the next take skips MediaRecorder and keeps live captions.
          if (silentStarvation) {
            consecutiveMicShareFailsRef.current = MIC_SHARE_FAIL_THRESHOLD;
          }
          preferLiveCaptionsOverFile();
        }
        // Swallow — preferLiveCaptionsOverFile already nudges STT on the freed mic.
        return true;
      }
      return false;
    },
    onUnavailable: (message) => {
      // File is already recording — keep the take. Transcript comes after Stop.
      if (fileRecorder && activeRef.current) {
        micShareFailedRef.current = true;
        setMicShareFailed(true);
        abortLiveRecognition();
        return;
      }
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
      sttHeardSpeechRef.current = true;
      meterSpeechSinceRef.current = 0;
      lastSpeechAtRef.current = Date.now();
      if (consecutiveMicShareFailsRef.current > 0) {
        consecutiveMicShareFailsRef.current = 0;
        void writeMicShareCache(true);
      }
    },
  });
  nudgeListeningRef.current = nudgeListening;

  // Audio-only takes (no live STT): burst-listen for spoken stop when wake FGS
  // is not handling it. Avoid restart loops while live STT owns the mic.
  useVoiceStopListener(
    Boolean(active && !paused && !stopping && audioOnly && !androidFgsStop),
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
  // Android `inactive` is often an app-switch, but Start/Stop taps and OEM
  // toasts are brief blips — debounce + ignore them during start grace so the
  // take does not pause-then-resume in the first ~2s.
  useEffect(() => {
    const clearLeaveTimer = () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
    const inStartGrace = () =>
      activeRef.current && Date.now() - startedAtRef.current < START_LIFECYCLE_GRACE_MS;
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
        // Real background still pauses even during grace — user left the app.
        pauseForLeave();
        return;
      }
      if (state === 'inactive') {
        if (pausedRef.current || interruptionPausedRef.current) {
          clearLeaveTimer();
          return;
        }
        // Start/Stop tap and ColorOS UI often emit inactive without leaving.
        if (inStartGrace()) {
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
      // When live STT owns the mic, metering from a suspended recorder is silent —
      // rely on onSpeechActivity instead of auto-pausing the take.
      if (micShareFailedRef.current) return;
      // Do not treat spoken-stop mic handoff as speech — only real audio resets the clock.
      if (!commandListenRef.current && fileRecorder) {
        const meter = meteringRef.current;
        if (typeof meter === 'number' && meter > SPEECH_METER_THRESHOLD) {
          sawSpeechRef.current = true;
          if (!sttHeardSpeechRef.current && meterSpeechSinceRef.current === 0) {
            meterSpeechSinceRef.current = Date.now();
          }
          lastSpeechAtRef.current = Date.now();
        }
      }
      if (commandListenRef.current) return;
      if (Date.now() - lastSpeechAtRef.current < SILENCE_PAUSE_MS) return;
      silenceHoldRef.current = true;
      lifecyclePausedRef.current = false;
      void pauseRef.current('silence');
      onSilencePauseRef.current?.();
    }, 500);
    return () => clearInterval(id);
  }, [active, paused, stopping, fileRecorder]);

  // ColorOS / older Android: MediaRecorder can starve STT without audio-capture
  // errors. If the meter hears speech for a few seconds and captions stay empty,
  // free the mic before the recognizer's ~10s no-speech timeout.
  useEffect(() => {
    if (!active || paused || stopping || audioOnly) return;
    if (!fileRecorder) return;
    const id = setInterval(() => {
      if (stoppingNowRef.current || pausedRef.current || !activeRef.current) return;
      if (micShareFailedRef.current || sttHeardSpeechRef.current) return;
      if (!meterSpeechSinceRef.current) return;
      // Wait long enough that a healthy Google STT would have produced interim text.
      if (Date.now() - meterSpeechSinceRef.current < 2800) return;
      consecutiveMicShareFailsRef.current = MIC_SHARE_FAIL_THRESHOLD;
      preferLiveCaptionsOverFile();
    }, 500);
    return () => clearInterval(id);
  }, [active, paused, stopping, audioOnly, fileRecorder, preferLiveCaptionsOverFile]);

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

    // Mic is required to record. Speech permission is best-effort — a denied
    // recognizer must not block saving the audio file.
    const speechOk = await requestSpeechPermissions();
    if (!speechOk) {
      micShareFailedRef.current = true;
      setMicShareFailed(true);
    }

    reset();
    abortLiveRecognition();
    spokenStopGuardRef.current = false;
    if (speechOk) {
      micShareFailedRef.current = false;
      setMicShareFailed(false);
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
    sawSpeechRef.current = false;
    sttHeardSpeechRef.current = false;
    meterSpeechSinceRef.current = 0;
    lastCommandListenAtRef.current = 0;
    commandListenRef.current = false;
    setDurationSec(0);
    pausedRef.current = false;

    // Open the take first so live STT (selected speech locale) can claim the
    // mic before MediaRecorder — otherwise OEM mic arbitration kills captions.
    // Same order on every Android version (11–15+); capability is runtime-detected.
    activeRef.current = true;
    setPaused(false);
    setActive(true);

    if (Platform.OS === 'android') {
      AndroidWakeWord.holdCaptureMute();
    }

    if (!audioOnly && speechOk && isSpeechRecognitionAvailable()) {
      if (Platform.OS === 'android') {
        AndroidWakeWord.silenceRecognitionUi();
      }
      // Settle long enough for Google STT on Android 11–15 before file recorder.
      await delay(650);
    } else if (!audioOnly && !isSpeechRecognitionAvailable()) {
      micShareFailedRef.current = true;
      setMicShareFailed(true);
    }

    // On OEMs that cannot share the mic, skip starting MediaRecorder so live
    // captions in the selected language keep the mic for the whole take.
    const shareCached = Platform.OS === 'android' ? await readMicShareCache() : true;
    const skipFileForLiveCaptions = shareCached === false && !audioOnly && speechOk;

    if (fileRecorder && !skipFileForLiveCaptions) {
      const started = await audio.start();
      // Without this the UI would show "Recording" while nothing is captured.
      if (!started) {
        activeRef.current = false;
        setActive(false);
        stopListening(true);
        if (Platform.OS === 'android') {
          AndroidWakeWord.releaseCaptureMute();
        }
        fail(audio.error ?? 'Could not start the recorder. Try again.');
        return null;
      }
      await audio.waitUntilRecording();
      await delay(200);
    } else if (skipFileForLiveCaptions) {
      micShareFailedRef.current = true;
      setMicShareFailed(true);
    }

    if (__DEV__) {
      console.log('[CAPTURE] mode', {
        audioOnly,
        micShareFailed: micShareFailedRef.current,
        androidVersion: Platform.Version,
      });
    }
    return true;
  }, [reset, audio, audioOnly, fail, fileRecorder, stopListening]);

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
      transcript = stripTrailingStopCommand(transcript);
      if (looksLikeWhisperHallucination(transcript)) {
        transcript = '';
      }
      const durationSec = resolveCaptureDurationSec(
        seconds,
        null,
        audioResult?.durationSec,
      );

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
      if (Platform.OS === 'android') {
        AndroidWakeWord.releaseCaptureMute();
      }
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
    if (Platform.OS === 'android') {
      AndroidWakeWord.releaseCaptureMute();
    }
  }, [reset, stopListening, audio, fileRecorder]);

  // Published globally so the wake listener stays paused for the whole take,
  // even if the user navigates away from Home mid-recording.
  useEffect(() => {
    useWakeWordStore.getState().setCaptureActive(active || stopping);
  }, [active, stopping]);

  // Re-apply OEM mute while a take is open — ColorOS / OxygenOS / MIUI sometimes
  // clear ADJUST_MUTE after a few seconds. Same interval on every Android version.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!active || stopping) return;
    AndroidWakeWord.silenceRecognitionUi();
    const id = setInterval(() => {
      AndroidWakeWord.silenceRecognitionUi();
    }, 4000);
    return () => clearInterval(id);
  }, [active, stopping]);

  // Live captions already contain the command — stop as soon as it appears.
  useEffect(() => {
    if (!active || stopping) {
      spokenStopGuardRef.current = false;
      return;
    }
    if (spokenStopGuardRef.current) return;
    if (!matchesStopPhrase(displayText)) return;
    spokenStopGuardRef.current = true;
    onVoiceStopRef.current?.();
  }, [displayText, active, stopping]);

  /**
   * Spoken stop while live STT is off (audio-only takes): after a short quiet,
   * suspend the file recorder and listen once. Kept rare + muted to avoid the
   * OPPO “tik-tik” beep loop. Wake-enabled takes use live STT or FGS instead.
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!audioOnly) return;
    if (!active || paused || stopping) return;

    let cancelled = false;
    let quietSince: number | null = null;

    const id = setInterval(() => {
      void (async () => {
        if (cancelled || commandListenRef.current || stoppingNowRef.current) return;
        if (pausedRef.current) return;
        const meter = meteringRef.current;
        const speaking = typeof meter === 'number' && meter > SPEECH_METER_THRESHOLD;
        if (speaking) {
          sawSpeechRef.current = true;
          quietSince = null;
          return;
        }
        if (!sawSpeechRef.current && Date.now() - startedAtRef.current < 1800) return;
        if (Date.now() - lastCommandListenAtRef.current < 3500) return;
        if (quietSince == null) quietSince = Date.now();
        if (Date.now() - quietSince < 900) return;

        commandListenRef.current = true;
        lastCommandListenAtRef.current = Date.now();
        quietSince = null;
        try {
          const held = await audio.suspendMic();
          if (!held || cancelled || stoppingNowRef.current) return;
          await delay(350);
          if (cancelled || stoppingNowRef.current) return;
          try {
            await setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: true,
              interruptionMode: 'mixWithOthers',
            });
          } catch {
            // still try
          }
          if (Platform.OS === 'android') {
            AndroidWakeWord.silenceRecognitionUi();
          }
          abortLiveRecognition();
          const heard = await listenOnceForStopPhrase(2200);
          if (cancelled || stoppingNowRef.current) return;
          if (heard) {
            if (__DEV__) console.log('[CAPTURE] heard spoken stop');
            spokenStopGuardRef.current = true;
            onVoiceStopRef.current?.();
            return;
          }
          await delay(150);
          if (cancelled || stoppingNowRef.current || pausedRef.current) return;
          await audio.resumeMic();
        } finally {
          commandListenRef.current = false;
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (commandListenRef.current && !stoppingNowRef.current && !pausedRef.current) {
        void audio.resumeMic();
      }
      commandListenRef.current = false;
    };
  }, [active, paused, stopping, audio, audioOnly]);

  // User/lifecycle pause on audio-only — mic is free; keep listening for stop.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!audioOnly) return;
    if (!active || !paused || stopping) return;
    if (commandListenRef.current) return;

    let cancelled = false;
    abortLiveRecognition();
    AndroidWakeWord.silenceRecognitionUi();
    void (async () => {
      const heard = await listenOnceForStopPhrase(10_000);
      if (!cancelled && heard) {
        spokenStopGuardRef.current = true;
        onVoiceStopRef.current?.();
      }
    })();
    return () => {
      cancelled = true;
      abortLiveRecognition();
    };
  }, [active, paused, stopping, audioOnly]);

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
    supportsVoiceStop: Platform.OS === 'android' || !(audioOnly || micShareFailed),
    savesAudioFile: fileRecorder && !micShareFailed,
    captureMode: audioOnly || micShareFailed ? ('audio-file' as const) : ('device' as const),
    liveTranscript: displayText,
    listening,
    speechLocale,
    micShareFailed,
  };
}
