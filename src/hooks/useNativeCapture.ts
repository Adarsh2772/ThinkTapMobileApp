import { AndroidWakeWord, type RecordingPayload } from 'android-wake-word';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { persistRecording } from '@/src/services/audioStorage';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Android capture driven entirely by the native single-microphone service.
 *
 * WHY this hook exists alongside useIdeaCapture: the old flow orchestrated two
 * microphone owners from JavaScript - pause the wake service, wait, start
 * expo-audio, hope the handoff landed. That handshake is what broke on every
 * device, because the timing depended on how a given OEM arbitrated the mic.
 *
 * There is no handshake here. The service owns the microphone for the whole
 * session and this hook only sends state transitions and listens for events.
 * Recording, wake, pause, resume and stop all come from the same audio stream,
 * so they cannot contend.
 *
 * The transcript is NOT produced here. The offline model recognises commands
 * only; the Human Signal comes from Whisper on the saved WAV after Stop.
 */

/**
 * WHY a module-level owner: HomeScreen can be mounted more than once (route
 * replaces, tab remounts), and each live copy registered its own listener. One
 * recording was then saved three times, producing three thoughts. Only the
 * newest instance acts on capture events; older copies stay inert.
 */
let captureOwner: symbol | null = null;

/** Guards against the same finished take being saved twice. */
let lastSavedPath: string | null = null;

export type NativeCaptureStatus = 'idle' | 'recording' | 'paused' | 'stopping';

export type NativeCaptureResult = {
  uri: string;
  durationSec: number;
};

type Options = {
  /** Wake phrase heard while idle - the screen should begin a take. */
  onWake?: () => void;
  /** A finished take. Transcription happens after this. */
  onFinished?: (result: NativeCaptureResult) => void;
  onError?: (message: string) => void;
  /** A call took the microphone; the take is paused and must not auto-resume. */
  onInterrupted?: () => void;
};

export function useNativeCapture(options: Options = {}) {
  const onWakeRef = useRef(options.onWake);
  const onFinishedRef = useRef(options.onFinished);
  const onErrorRef = useRef(options.onError);
  const onInterruptedRef = useRef(options.onInterrupted);
  onWakeRef.current = options.onWake;
  onFinishedRef.current = options.onFinished;
  onErrorRef.current = options.onError;
  onInterruptedRef.current = options.onInterrupted;

  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeHydrated = useWakeWordStore((s) => s.hydrated);
  const setListening = useWakeWordStore((s) => s.setListening);
  const setAvailable = useWakeWordStore((s) => s.setAvailable);
  const setLastHeard = useWakeWordStore((s) => s.setLastHeard);
  const setCaptureActive = useWakeWordStore((s) => s.setCaptureActive);

  const [status, setStatus] = useState<NativeCaptureStatus>('idle');
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);

  const supported = Platform.OS === 'android' && AndroidWakeWord.isSupported();
  const stoppingRef = useRef(false);
  const ownerRef = useRef<symbol>(Symbol('capture'));

  // Newest mount claims ownership.
  useEffect(() => {
    captureOwner = ownerRef.current;
  }, []);

  // ---------------------------------------------------------------
  // Recording state events from the service
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!supported) return;

    const subs = [
      AndroidWakeWord.addListener('onRecordingState', (e: RecordingPayload) => {
        if (captureOwner !== ownerRef.current) return;
        console.log('[NATIVE] recording', e.state, {
          fromVoice: e.fromVoice,
          ms: e.durationMs,
        });

        switch (e.state) {
          case 'started':
            stoppingRef.current = false;
            setStatus('recording');
            setDurationSec(0);
            setCaptureActive(true);
            break;

          case 'paused':
            setStatus('paused');
            setDurationSec(Math.floor(e.durationMs / 1000));
            break;

          case 'resumed':
            setStatus('recording');
            break;

          case 'stopped': {
            setStatus('idle');
            setCaptureActive(false);
            stoppingRef.current = false;
            const seconds = Math.max(1, Math.round(e.durationMs / 1000));
            setDurationSec(0);
            if (!e.path) {
              setError('The recording could not be saved.');
              onErrorRef.current?.('The recording could not be saved.');
              return;
            }
            // WHY: the service can emit 'stopped' more than once (a stop event
            // plus the state broadcast). Saving per event created duplicates.
            if (lastSavedPath === e.path) {
              console.log('[NATIVE] duplicate stop ignored for', e.path);
              return;
            }
            lastSavedPath = e.path;
            // Move out of the service's directory into app documents so the
            // file survives cache clearing and is reachable by the player.
            void (async () => {
              try {
                const uri = await persistRecording(e.path);
                onFinishedRef.current?.({ uri, durationSec: seconds });
              } catch (err) {
                console.warn('[NATIVE] persist failed', err);
                onFinishedRef.current?.({ uri: e.path, durationSec: seconds });
              }
            })();
            break;
          }

          case 'discarded':
            setStatus('idle');
            setDurationSec(0);
            setCaptureActive(false);
            break;
        }
      }),

      AndroidWakeWord.addListener('onWakeDetected', (e) => {
        if (captureOwner !== ownerRef.current) return;
        console.log('[NATIVE] wake:', e.transcript);
        setLastHeard(e.transcript);
        onWakeRef.current?.();
      }),

      AndroidWakeWord.addListener('onPartialResult', (e) => {
        if (e.transcript) setLastHeard(e.transcript);
      }),

      AndroidWakeWord.addListener('onListeningChange', (e) => {
        setListening(e.listening);
      }),

      AndroidWakeWord.addListener('onError', (e) => {
        console.warn('[NATIVE] error', e.code, e.message);
        if (e.code === 'permission') {
          setAvailable(false);
          setError('Microphone permission is required.');
          onErrorRef.current?.('Microphone permission is required.');
          return;
        }
        if (e.code === 'model-unavailable') {
          /**
           * WHY not surfaced to the user: only voice commands are lost. The
           * buttons still work and recording is unaffected, so an error dialog
           * here would be noise.
           */
          console.warn('[NATIVE] voice commands unavailable:', e.message);
          return;
        }
        setError(e.message);
        onErrorRef.current?.(e.message);
      }),

      AndroidWakeWord.addListener('onCallState', (e) => {
        if (!e.active) return;
        if (!AndroidWakeWord.isRecording()) return;
        void AndroidWakeWord.pauseRecording();
        onInterruptedRef.current?.();
      }),
    ];

    return () => subs.forEach((s) => s.remove());
  }, [supported, setCaptureActive, setLastHeard, setListening, setAvailable]);

  // ---------------------------------------------------------------
  // Idle listening follows the Settings toggle
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!supported || !wakeHydrated) return;

    if (wakeEnabled) {
      void AndroidWakeWord.startListening().catch((e) => {
        console.warn('[NATIVE] startListening failed', e);
        setAvailable(false);
      });
      setAvailable(true);
    } else if (!AndroidWakeWord.isRecording()) {
      // Keep the service alive if a take is in progress, even with wake off.
      void AndroidWakeWord.stopListening();
    }
  }, [supported, wakeEnabled, wakeHydrated, setAvailable]);

  // Poll the model state so the UI can show when commands become available.
  useEffect(() => {
    if (!supported || modelReady) return;
    const id = setInterval(() => {
      if (AndroidWakeWord.isModelReady()) {
        setModelReady(true);
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [supported, modelReady]);

  /**
   * Timer driven by the service's own byte count rather than a wall clock, so
   * paused time is never counted and the displayed value always matches the
   * audio that actually exists in the file.
   */
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused') return;
    const tick = () => setDurationSec(Math.floor(AndroidWakeWord.recordedMs() / 1000));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status]);

  /**
   * WHY nothing happens on background: the service is a microphone foreground
   * service, so the take continues while the app is minimised or the screen is
   * locked. The old build had to abort transcription here because the
   * activity-bound recogniser died; that problem no longer exists.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      console.log('[NATIVE] app state', s, 'recording:', AndroidWakeWord.isRecording());
    });
    return () => sub.remove();
  }, []);

  // ---------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    if (AndroidWakeWord.isRecording()) return true;
    setError(null);
    try {
      await AndroidWakeWord.startRecording(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start recording';
      setError(msg);
      onErrorRef.current?.(msg);
      return false;
    }
  }, [supported]);

  const pause = useCallback(async (): Promise<boolean> => {
    if (!supported || !AndroidWakeWord.isRecording()) return false;
    return AndroidWakeWord.pauseRecording();
  }, [supported]);

  const resume = useCallback(async (): Promise<boolean> => {
    if (!supported || !AndroidWakeWord.isRecording()) return false;
    if (AndroidWakeWord.isCallActive()) {
      onInterruptedRef.current?.();
      return false;
    }
    return AndroidWakeWord.resumeRecording();
  }, [supported]);

  const stop = useCallback(async (): Promise<boolean> => {
    if (!supported || !AndroidWakeWord.isRecording()) return false;
    if (stoppingRef.current) return false;
    stoppingRef.current = true;
    setStatus('stopping');
    // The result arrives on the 'stopped' event, not from this promise.
    return AndroidWakeWord.stopRecording();
  }, [supported]);

  const discard = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    return AndroidWakeWord.discardRecording();
  }, [supported]);

  return {
    supported,
    /** False until the offline model unpacks. Recording works regardless. */
    modelReady,
    status,
    isRecording: status === 'recording' || status === 'paused',
    isActivelyRecording: status === 'recording',
    isPaused: status === 'paused',
    durationSec,
    error,
    start,
    pause,
    resume,
    stop,
    discard,
  };
}
