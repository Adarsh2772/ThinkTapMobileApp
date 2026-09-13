import { AndroidWakeWord, type RecordingPayload } from 'android-wake-word';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

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
  /** The call ended. The take is still paused - prompt the user to resume. */
  onCallEnded?: () => void;
};

export function useNativeCapture(options: Options = {}) {
  const onWakeRef = useRef(options.onWake);
  const onFinishedRef = useRef(options.onFinished);
  const onErrorRef = useRef(options.onError);
  const onInterruptedRef = useRef(options.onInterrupted);
  const onCallEndedRef = useRef(options.onCallEnded);
  onWakeRef.current = options.onWake;
  onFinishedRef.current = options.onFinished;
  onErrorRef.current = options.onError;
  onInterruptedRef.current = options.onInterrupted;
  onCallEndedRef.current = options.onCallEnded;

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
  /** True while a take is paused because of a phone call. */
  const [callHold, setCallHold] = useState(false);
  const callHoldRef = useRef(false);

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
        if (captureOwner !== ownerRef.current) return;

        if (e.active) {
          if (!AndroidWakeWord.isRecording()) return;
          if (AndroidWakeWord.isPaused()) return;
          callHoldRef.current = true;
          setCallHold(true);
          void AndroidWakeWord.pauseRecording();
          onInterruptedRef.current?.();
          return;
        }

        /**
         * Call ended. The take stays paused ON PURPOSE.
         *
         * WHY no auto-resume: a call can last minutes and the user has usually
         * moved on by the time it ends. Resuming on their behalf would capture
         * audio they did not intend to record, which is worse than making them
         * spend one tap. They resume with the button or "hey think tap resume".
         */
        if (callHoldRef.current) {
          callHoldRef.current = false;
          setCallHold(false);
          onCallEndedRef.current?.();
        }
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

  /**
   * WHY started here: the watcher detects cellular and VoIP calls via audio
   * mode, and must be live for the whole session - not just while recording -
   * so a call that arrives mid-take is caught immediately.
   */
  useEffect(() => {
    if (!supported) return;
    void AndroidWakeWord.startCallWatch();
    return () => {
      void AndroidWakeWord.stopCallWatch();
    };
  }, [supported]);

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
  /**
   * The microphone follows the app's foreground state.
   *
   * WHY: an always-listening microphone was starting recordings on its own and
   * holding the mic while the user was in other apps. Listening only while the
   * app is open removes that entirely - the microphone indicator clears the
   * moment you leave.
   *
   * An open take is paused rather than stopped, so the recording is never lost.
   * It stays paused on return: the user resumes with the button or by saying
   * "hey think tap resume". Auto-resuming would capture audio they did not
   * intend, since they may have been away for minutes.
   *
   * TRADE-OFF: voice commands cannot be heard from outside the app, so a
   * recording cannot be started or resumed by voice while backgrounded.
   */
  useEffect(() => {
    if (!supported) return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void AndroidWakeWord.resumeMic();
        return;
      }
      if (next === 'background' || next === 'inactive') {
        void AndroidWakeWord.suspendMic();
      }
    });

    return () => {
      sub.remove();
    };
  }, [supported]);

  // ---------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    if (AndroidWakeWord.isRecording()) return true;
    setError(null);

    /**
     * WHY permission is requested here: with the wake toggle off, nothing else
     * in the app ever asks for RECORD_AUDIO. The service then failed silently
     * while the UI still showed "Recording started" - reported on OPPO A51 /
     * Android 11.
     */
    try {
      /**
       * WHY a rationale is passed: without it Android shows a bare
       * "Allow Think Tap to record audio?" with no context, and users decline
       * out of caution. Saying what it is for up front raises acceptance and is
       * simply honest.
       */
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone access',
          message:
            'Think Tap records your spoken ideas so they are never lost. ' +
            'Audio stays on your phone; only the recording you make is used ' +
            'to create your transcript.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        const msg = 'Microphone permission is required to record.';
        setError(msg);
        onErrorRef.current?.(msg);
        return false;
      }
      if (Number(Platform.Version) >= 33) {
        // The service is a foreground service; without this its notification
        // is suppressed and some OEMs then kill it.
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
            title: 'Recording notification',
            message:
              'Android requires a notification while recording. Without it the ' +
              'system stops the recording partway through.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        );
      }
    } catch (e) {
      console.warn('[NATIVE] permission request failed', e);
    }

    try {
      await AndroidWakeWord.startRecording(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start recording';
      setError(msg);
      onErrorRef.current?.(msg);
      return false;
    }

    /**
     * WHY this confirmation exists: startRecording only sends an intent, so it
     * resolves even when the service fails afterwards. Without checking the
     * real state the UI reported success for a take that never began.
     */
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 150));
      if (AndroidWakeWord.isRecording()) return true;
    }

    const msg =
      'Recording did not start. Check that microphone permission is allowed and ' +
      'battery usage is set to Unrestricted for Think Tap.';
    console.warn('[NATIVE] start not confirmed after 1.8s');
    setError(msg);
    onErrorRef.current?.(msg);
    return false;
  }, [supported]);

  const pause = useCallback(async (): Promise<boolean> => {
    if (!supported || !AndroidWakeWord.isRecording()) return false;
    return AndroidWakeWord.pauseRecording();
  }, [supported]);

  const resume = useCallback(async (): Promise<boolean> => {
    if (!supported || !AndroidWakeWord.isRecording()) return false;
    // WHY: resuming mid-call would record the call audio, not the user's idea.
    if (AndroidWakeWord.isCallActive()) {
      onInterruptedRef.current?.();
      return false;
    }
    callHoldRef.current = false;
    setCallHold(false);
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
    /** Paused by a phone call - the UI should say so and offer Resume. */
    callHold,
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
