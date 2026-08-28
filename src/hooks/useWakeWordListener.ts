import { AndroidWakeWord } from 'android-wake-word';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { matchesWakePhrase, allVoiceCommandContextualStrings } from '@/src/features/wakeWord/phrases';
import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';
import { listVoiceCommandLocales } from '@/src/services/languageTranscriptService';
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

  const useNativeFgs =
    Platform.OS === 'android' &&
    AndroidWakeWord.isSupported() &&
    AndroidWakeWord.hasUpdatedNativeModule();
  const [fgsRuntimeFailed, setFgsRuntimeFailed] = useState(false);
  const fgsFailedRef = useRef(false);
  const effectiveUseFgs = useNativeFgs && !fgsRuntimeFailed;
  const syncInFlightRef = useRef(false);

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
    if (useNativeFgs && !fgsFailedRef.current) return;
    if (!canListenInApp() || startingRef.current || wakeLocaleExhaustedRef.current) return;
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
      if (fromScheduledRestart) {
        voiceLocaleIndexRef.current =
          (voiceLocaleIndexRef.current + 1) % Math.max(1, locales.length);
      } else {
        voiceLocaleIndexRef.current = 0;
      }
      wakeLocaleRef.current = locales[voiceLocaleIndexRef.current] ?? 'hi-IN';

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
    if (effectiveUseFgs) return;
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
    if (effectiveUseFgs) return;
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
    if (effectiveUseFgs) return;
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
      if (useNativeFgs) {
        if (!enabled) {
          await AndroidWakeWord.stopService();
          AndroidWakeWord.restoreRecognitionUi();
          setListening(false);
          setFgsRuntimeFailed(false);
          fgsFailedRef.current = false;
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

        // While capturing an idea, fully stop the FGS so OS STT can own the mic.
        // Pause is not enough on many Android devices (SpeechRecognizer is a singleton).
        if (pausedForRecording) {
          if (AndroidWakeWord.isRunning()) {
            await AndroidWakeWord.stopService();
          }
          AndroidWakeWord.restoreRecognitionUi();
          setListening(false);
          return;
        }

        // Permission prompts above are async, so re-read the live flag: a take
        // may have started meanwhile and the FGS would steal its microphone.
        if (useWakeWordStore.getState().pausedForRecording) {
          setListening(false);
          return;
        }

        if (!fgsFailedRef.current) {
          if (!AndroidWakeWord.isRunning()) {
            try {
              const locales = await listVoiceCommandLocales();
              const locale = locales[voiceLocaleIndexRef.current] ?? locales[0] ?? 'hi-IN';
              await AndroidWakeWord.startService(locale);
              setFgsRuntimeFailed(false);
              fgsFailedRef.current = false;
            } catch (e) {
              console.warn('Failed to start wake FGS; using in-app listener', e);
              fgsFailedRef.current = true;
              setFgsRuntimeFailed(true);
              void startInAppListening();
              return;
            }
          } else if (AndroidWakeWord.isPaused()) {
            await AndroidWakeWord.resumeService();
          }

          const pending = await AndroidWakeWord.consumePendingWake();
          if (pending?.transcript) {
            setLastHeard(pending.transcript);
            fireWakeTrigger();
          }
          return;
        }
      }

      // iOS / fallback path (including Android when FGS failed to start)
      if (enabled && !pausedForRecording) {
        void startInAppListening();
      } else {
        stopInAppListening('pause');
        if (!enabled) AndroidWakeWord.restoreRecognitionUi();
      }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void sync();

    const sub = AppState.addEventListener('change', (state) => {
      if (!useWakeWordStore.getState().enabled) return;
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
        if (!useWakeWordStore.getState().pausedForRecording) {
          void sync();
        }
        if (!fgsFailedRef.current) {
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
      if (!effectiveUseFgs) {
        stopInAppListening('unmount');
      } else if (AndroidWakeWord.isRunning()) {
        void AndroidWakeWord.stopService().then(() => AndroidWakeWord.restoreRecognitionUi());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated, pausedForRecording, useNativeFgs, fgsRuntimeFailed]);
}
