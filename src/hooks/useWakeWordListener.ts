import { AndroidWakeWord } from 'android-wake-word';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';
import { allVoiceCommandContextualStrings, matchesWakePhrase } from '@/src/features/wakeWord/phrases';
import { listVoiceCommandLocales } from '@/src/services/languageTranscriptService';
import { shouldRunWakeListening, useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Wake-word orchestration:
 * - Android: Foreground Service (works minimized → opens app → record)
 * - iOS / fallback: in-app expo-speech-recognition (foreground only)
 *
 * SpeechRecognizer is NEVER started on cold launch — only after the user
 * explicitly enables Hey Think Tap (toggle / onboarding).
 */
function canListenInApp(): boolean {
  return shouldRunWakeListening() && AppState.currentState === 'active';
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
  const listeningArmed = useWakeWordStore((s) => s.listeningArmed);
  const hydrated = useWakeWordStore((s) => s.hydrated);
  const pausedForRecording = useWakeWordStore((s) => s.pausedForRecording);
  const captureActive = useWakeWordStore((s) => s.captureActive);
  const setListening = useWakeWordStore((s) => s.setListening);
  const setAvailable = useWakeWordStore((s) => s.setAvailable);
  const setLastHeard = useWakeWordStore((s) => s.setLastHeard);
  const fireWakeTrigger = useWakeWordStore((s) => s.fireWakeTrigger);

  const useNativeFgs =
    Platform.OS === 'android' &&
    AndroidWakeWord.isSupported() &&
    AndroidWakeWord.hasUpdatedNativeModule();
  const [fgsRuntimeFailed, setFgsRuntimeFailed] = useState(false);
  const fgsFailedRef = useRef(false);
  const effectiveUseFgs = useNativeFgs && !fgsRuntimeFailed;
  const syncInFlightRef = useRef(false);
  const fgsStartingRef = useRef(false);

  /** FGS is the source of truth only while it is actually running. */
  const isFgsListening = () =>
    effectiveUseFgs && AndroidWakeWord.isSupported() && AndroidWakeWord.isRunning();

  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const mountedRef = useRef(true);
  const clientFailCount = useRef(0);
  const wakeLocaleRef = useRef<SpeechLocaleCode | 'en-US'>('hi-IN');
  const voiceLocalesRef = useRef<(SpeechLocaleCode | 'en-US')[]>([
    'hi-IN',
    'mr-IN',
    'en-IN',
    'en-US',
  ]);
  const voiceLocaleIndexRef = useRef(0);
  const wakeLocaleExhaustedRef = useRef(false);

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
        void startInAppListening(true);
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
    if (!effectiveUseFgs) setListening(false);
  };

  const startInAppListening = async (fromScheduledRestart = false) => {
    if (isFgsListening() || fgsStartingRef.current) return;
    if (!canListenInApp() || startingRef.current) return;
    if (wakeLocaleExhaustedRef.current) {
      wakeLocaleExhaustedRef.current = false;
    }
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

      const locales = await listVoiceCommandLocales();
      voiceLocalesRef.current = locales;
      if (!fromScheduledRestart) {
        voiceLocaleIndexRef.current = 0;
      }
      wakeLocaleRef.current = locales[voiceLocaleIndexRef.current] ?? 'hi-IN';

      if (Platform.OS === 'android') {
        AndroidWakeWord.silenceRecognitionUi();
      }

      ExpoSpeechRecognitionModule.start({
        lang: wakeLocaleRef.current,
        interimResults: true,
        continuous: true,
        addsPunctuation: false,
        contextualStrings: allVoiceCommandContextualStrings(),
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 12000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 12000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1500,
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
    if (isFgsListening()) return;
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
    if (isFgsListening()) return;
    setListening(false);
    if (intentionalStopRef.current) {
      intentionalStopRef.current = false;
      return;
    }
    if (!canListenInApp()) return;
    // Longer gap = less beep spam / battery drain on non-FGS Android fallback.
    scheduleRestart(6000);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (isFgsListening()) return;
    setListening(false);
    if (intentionalStopRef.current || event.error === 'aborted') {
      intentionalStopRef.current = false;
      return;
    }
    if (!canListenInApp()) return;
    if (event.error === 'language-not-supported') {
      const locales = voiceLocalesRef.current;
      if (locales.length <= 1) {
        wakeLocaleExhaustedRef.current = true;
        setAvailable(false);
        return;
      }
      voiceLocaleIndexRef.current =
        (voiceLocaleIndexRef.current + 1) % locales.length;
      wakeLocaleRef.current = locales[voiceLocaleIndexRef.current] ?? 'en-US';
      scheduleRestart(1200);
      return;
    }
    if (event.error === 'no-speech') {
      scheduleRestart(5000);
      return;
    }
    if (event.error === 'client') {
      clientFailCount.current += 1;
      scheduleRestart(Math.min(15000, 4000 * clientFailCount.current));
      return;
    }
    console.warn('Wake word error', event.error, event.message);
    scheduleRestart(6000);
  });

  // ——— Android Foreground Service ———
  useEffect(() => {
    if (!effectiveUseFgs || !hydrated) return;

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
  }, [effectiveUseFgs, hydrated, setLastHeard, fireWakeTrigger, setListening, setAvailable]);

  // Sync service lifecycle with enabled / recording pause
  useEffect(() => {
    mountedRef.current = true;
    if (!hydrated) return;

    const sync = async () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      try {
      const runWakeMic = shouldRunWakeListening();

      // Always tear down wake mic when capture owns the session or user disarmed.
      if (!runWakeMic) {
        stopInAppListening('pause');
        if (useNativeFgs) {
          await AndroidWakeWord.stopService();
          AndroidWakeWord.restoreRecognitionUi();
        }
        setListening(false);
        if (!enabled || !listeningArmed) {
          setFgsRuntimeFailed(false);
          fgsFailedRef.current = false;
        }
        return;
      }

      if (useNativeFgs) {
        wakeLocaleExhaustedRef.current = false;

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

        if (!fgsFailedRef.current) {
          if (!AndroidWakeWord.isRunning()) {
            fgsStartingRef.current = true;
            try {
              const wakeLocale = useWakeWordStore.getState().lastWakeLocale;
              const locales = await listVoiceCommandLocales();
              const preferred =
                wakeLocale ??
                locales[voiceLocaleIndexRef.current] ??
                locales[0] ??
                'hi-IN';
              const locale = locales.includes(preferred)
                ? preferred
                : wakeLocale ?? preferred;
              await AndroidWakeWord.startService(locale);
              setFgsRuntimeFailed(false);
              fgsFailedRef.current = false;
            } catch (e) {
              console.warn('Failed to start wake FGS; using in-app listener', e);
              fgsFailedRef.current = true;
              setFgsRuntimeFailed(true);
              void startInAppListening();
              return;
            } finally {
              fgsStartingRef.current = false;
            }
          } else if (AndroidWakeWord.isPaused()) {
            await AndroidWakeWord.resumeService();
          }

          if (AndroidWakeWord.isRunning()) {
            const pending = await AndroidWakeWord.consumePendingWake();
            if (pending?.transcript) {
              setLastHeard(pending.transcript);
              fireWakeTrigger();
            }
            return;
          }
        }
      }

      // iOS / fallback path (including Android when FGS is not actually running)
      if (
        !isFgsListening() &&
        !fgsStartingRef.current &&
        (!useNativeFgs || fgsFailedRef.current)
      ) {
        void startInAppListening();
      }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void sync();

    const sub = AppState.addEventListener('change', (state) => {
      const wake = useWakeWordStore.getState();
      if (!wake.enabled || !wake.listeningArmed) return;
      if (useNativeFgs) {
        // Stop the FGS when the app leaves the foreground so SpeechRecognizer
        // cannot keep restarting (and beeping) after the user closes Think Tap.
        if (state !== 'active') {
          void AndroidWakeWord.stopService().then(() => {
            AndroidWakeWord.restoreRecognitionUi();
            setListening(false);
          });
          return;
        }
        if (!useWakeWordStore.getState().pausedForRecording && !useWakeWordStore.getState().captureActive) {
          void sync();
        }
        if (!fgsFailedRef.current && AndroidWakeWord.isRunning()) {
          void AndroidWakeWord.consumePendingWake().then((pending) => {
            if (pending?.transcript) {
              setLastHeard(pending.transcript);
              fireWakeTrigger();
            }
          });
        }
        return;
      }
      if (state === 'active' && shouldRunWakeListening()) {
        void startInAppListening();
      } else {
        stopInAppListening('pause');
      }
    });

    return () => {
      mountedRef.current = false;
      sub.remove();
      if (!effectiveUseFgs) {
        stopInAppListening('unmount');
      } else if (AndroidWakeWord.isRunning()) {
        void AndroidWakeWord.stopService().then(() => AndroidWakeWord.restoreRecognitionUi());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, listeningArmed, hydrated, pausedForRecording, captureActive, useNativeFgs, fgsRuntimeFailed]);
}
