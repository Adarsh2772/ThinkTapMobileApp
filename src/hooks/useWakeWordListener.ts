import { AndroidWakeWord } from 'android-wake-word';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { matchesWakePhrase } from '@/src/features/wakeWord/phrases';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Wake-word orchestration:
 * - Android: Foreground Service (works minimized → opens app → record)
 * - iOS / fallback: in-app expo-speech-recognition (foreground only)
 */
function canListenInApp(): boolean {
  const s = useWakeWordStore.getState();
  return (
    s.enabled &&
    !s.pausedForRecording &&
    AppState.currentState === 'active'
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;
  const granted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  if (granted) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function ensureAndroidMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  if (granted) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useWakeWordListener() {
  const enabled = useWakeWordStore((s) => s.enabled);
  const hydrated = useWakeWordStore((s) => s.hydrated);
  const pausedForRecording = useWakeWordStore((s) => s.pausedForRecording);
  const setListening = useWakeWordStore((s) => s.setListening);
  const setAvailable = useWakeWordStore((s) => s.setAvailable);
  const setLastHeard = useWakeWordStore((s) => s.setLastHeard);
  const fireWakeTrigger = useWakeWordStore((s) => s.fireWakeTrigger);

  const useNativeFgs = Platform.OS === 'android' && AndroidWakeWord.isSupported();

  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const mountedRef = useRef(true);
  const clientFailCount = useRef(0);

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const scheduleRestart = (ms: number) => {
    clearRestart();
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      if (mountedRef.current && canListenInApp()) {
        void startInAppListening();
      }
    }, ms);
  };

  const stopInAppListening = (reason: 'pause' | 'unmount' | 'wake' = 'pause') => {
    intentionalStopRef.current = true;
    clearRestart();
    try {
      if (reason === 'unmount') {
        ExpoSpeechRecognitionModule.abort();
      } else {
        ExpoSpeechRecognitionModule.stop();
      }
    } catch {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    }
    if (!useNativeFgs) setListening(false);
  };

  const startInAppListening = async () => {
    if (useNativeFgs) return;
    if (!canListenInApp() || startingRef.current) return;
    startingRef.current = true;
    clearRestart();

    try {
      intentionalStopRef.current = true;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
      await delay(450);
      intentionalStopRef.current = false;

      if (!canListenInApp() || !mountedRef.current) return;

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setAvailable(false);
        setListening(false);
        return;
      }

      const supported = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      setAvailable(supported);
      if (!supported) {
        setListening(false);
        return;
      }

      if (!canListenInApp() || !mountedRef.current) return;

      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        addsPunctuation: false,
        contextualStrings: [
          'Hey Think Tap',
          'Think Tap',
          'start recording',
          'stop recording',
          'ThinkTap',
        ],
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          // Longer silence = fewer restarts = quieter / cooler phone.
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 6000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 6000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1200,
        },
      });
      setListening(true);
      clientFailCount.current = 0;
    } catch (e) {
      console.warn('Wake word start failed', e);
      setAvailable(false);
      setListening(false);
      if (canListenInApp()) scheduleRestart(2500);
    } finally {
      startingRef.current = false;
    }
  };

  // ——— In-app recognition events (iOS / non-FGS fallback) ———
  useSpeechRecognitionEvent('result', (event) => {
    if (useNativeFgs) return;
    const results = event.results ?? [];
    for (const item of results) {
      const transcript = item?.transcript?.trim() ?? '';
      if (!transcript) continue;
      setLastHeard(transcript);
      if (matchesWakePhrase(transcript)) {
        fireWakeTrigger();
        stopInAppListening('wake');
        return;
      }
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (useNativeFgs) return;
    setListening(false);
    if (intentionalStopRef.current) {
      intentionalStopRef.current = false;
      return;
    }
    if (!canListenInApp()) return;
    // Longer gap = less beep spam / battery drain on non-FGS Android fallback.
    scheduleRestart(3000);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (useNativeFgs) return;
    setListening(false);
    if (intentionalStopRef.current || event.error === 'aborted') {
      intentionalStopRef.current = false;
      return;
    }
    if (!canListenInApp()) return;
    if (event.error === 'no-speech') {
      scheduleRestart(2800);
      return;
    }
    if (event.error === 'client') {
      clientFailCount.current += 1;
      scheduleRestart(Math.min(12000, 2500 * clientFailCount.current));
      return;
    }
    console.warn('Wake word error', event.error, event.message);
    scheduleRestart(4000);
  });

  // ——— Android Foreground Service ———
  useEffect(() => {
    if (!useNativeFgs || !hydrated) return;

    const subs = [
      AndroidWakeWord.addListener('onWakeDetected', (event) => {
        setLastHeard(event.transcript);
        fireWakeTrigger();
      }),
      AndroidWakeWord.addListener('onPartialResult', (event) => {
        if (event.transcript) setLastHeard(event.transcript);
      }),
      AndroidWakeWord.addListener('onListeningChange', (event) => {
        setListening(event.listening && !event.paused);
      }),
      AndroidWakeWord.addListener('onError', (event) => {
        if (event.code === 'unavailable' || event.code === 'permission') {
          setAvailable(false);
        }
        console.warn('Wake FGS error', event.code, event.message);
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [useNativeFgs, hydrated, setLastHeard, fireWakeTrigger, setListening, setAvailable]);

  // Sync service lifecycle with enabled / recording pause
  useEffect(() => {
    mountedRef.current = true;
    if (!hydrated) return;

    const sync = async () => {
      if (useNativeFgs) {
        if (!enabled) {
          await AndroidWakeWord.stopService();
          setListening(false);
          return;
        }

        const micOk = await ensureAndroidMicPermission();
        const notifOk = await ensureAndroidNotificationPermission();
        if (!micOk) {
          setAvailable(false);
          setListening(false);
          return;
        }
        setAvailable(true);
        if (!notifOk) {
          console.warn('Notification permission denied — wake service may be limited on Android 13+');
        }

        if (!AndroidWakeWord.isRunning()) {
          try {
            await AndroidWakeWord.startService();
          } catch (e) {
            console.warn('Failed to start wake FGS', e);
            setAvailable(false);
            return;
          }
        }

        // Avoid rapid pause/resume thrash — only call when state actually differs.
        const currentlyPaused = AndroidWakeWord.isPaused();
        if (pausedForRecording && !currentlyPaused) {
          await AndroidWakeWord.pauseService();
        } else if (!pausedForRecording && currentlyPaused) {
          await AndroidWakeWord.resumeService();
        }

        // Consume pending wake if app was opened from background detection
        const pending = await AndroidWakeWord.consumePendingWake();
        if (pending?.transcript) {
          setLastHeard(pending.transcript);
          fireWakeTrigger();
        }
        return;
      }

      // iOS / fallback path
      if (enabled && !pausedForRecording) {
        void startInAppListening();
      } else {
        stopInAppListening('pause');
      }
    };

    void sync();

    const sub = AppState.addEventListener('change', (state) => {
      if (!useWakeWordStore.getState().enabled) return;
      if (useNativeFgs) {
        // FGS keeps listening in background; on resume, pick up pending wake.
        if (state === 'active') {
          void AndroidWakeWord.consumePendingWake().then((pending) => {
            if (pending?.transcript) {
              setLastHeard(pending.transcript);
              fireWakeTrigger();
            }
          });
        }
        return;
      }
      if (state === 'active' && !useWakeWordStore.getState().pausedForRecording) {
        void startInAppListening();
      } else {
        stopInAppListening('pause');
      }
    });

    return () => {
      mountedRef.current = false;
      sub.remove();
      if (!useNativeFgs) {
        stopInAppListening('unmount');
      }
      // Do not stop FGS on unmount of provider remount — only when disabled.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated, pausedForRecording, useNativeFgs]);
}
