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
 * Wake-word listening.
 *
 * ANDROID: almost nothing happens here any more. The native AudioCaptureService
 * owns the single microphone and detects wake, stop, pause and resume from the
 * same audio stream it records. This hook only forwards native events into the
 * store so the app can navigate and begin a take.
 *
 * WHY it shrank so much: the old version orchestrated a microphone handoff from
 * JavaScript - pause the wake service, wait 450ms, hope the mic was free, start
 * the recogniser, resume afterwards. Every step could fail differently per
 * device, and that handshake was the source of the mic bugs. There is no
 * handoff now, so there is nothing to coordinate.
 *
 * IOS / fallback: unchanged - in-app expo-speech-recognition, foreground only.
 */

function canListenInApp(): boolean {
  const s = useWakeWordStore.getState();
  return (
    s.enabled &&
    !s.pausedForRecording &&
    !s.playbackActive &&
    AppState.currentState === 'active'
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
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
  const playbackActive = useWakeWordStore((s) => s.playbackActive);
  const setListening = useWakeWordStore((s) => s.setListening);
  const setAvailable = useWakeWordStore((s) => s.setAvailable);
  const setLastHeard = useWakeWordStore((s) => s.setLastHeard);
  const fireWakeTrigger = useWakeWordStore((s) => s.fireWakeTrigger);
  const fireStopTrigger = useWakeWordStore((s) => s.fireStopTrigger);

  const useNative = Platform.OS === 'android' && AndroidWakeWord.isSupported();

  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const mountedRef = useRef(true);

  // ================= ANDROID: native service =================

  useEffect(() => {
    if (!useNative || !hydrated) return;

    const subs = [
      AndroidWakeWord.addListener('onWakeDetected', (event) => {
        setLastHeard(event.transcript);
        fireWakeTrigger();
      }),
      /**
       * WHY no onRecordingState listener here: useNativeCapture already handles
       * it and runs the save pipeline. Listening in both places fired the
       * 'stopped' handler three times for one take.
       */
      AndroidWakeWord.addListener('onPartialResult', (event) => {
        if (event.transcript) setLastHeard(event.transcript);
      }),
      AndroidWakeWord.addListener('onListeningChange', (event) => {
        setListening(event.listening);
      }),
      AndroidWakeWord.addListener('onError', (event) => {
        if (event.code === 'permission' || event.code === 'unavailable') {
          setAvailable(false);
        }
        console.warn('[WAKE] native error', event.code, event.message);
      }),
    ];

    return () => subs.forEach((s) => s.remove());
  }, [
    useNative,
    hydrated,
    setLastHeard,
    fireWakeTrigger,
    setListening,
    setAvailable,
  ]);

  useEffect(() => {
    if (!useNative || !hydrated) return;
    let cancelled = false;

    void (async () => {
      if (!enabled) {
        /**
         * WHY the isRecording guard: a take may be running with the wake toggle
         * off (the user tapped the button). Stopping the service would kill the
         * recording, so listening is only released when nothing is in progress.
         */
        if (!AndroidWakeWord.isRecording()) {
          await AndroidWakeWord.stopListening();
          setListening(false);
        }
        return;
      }

      const micOk = await ensureAndroidMicPermission();
      if (cancelled) return;
      if (!micOk) {
        setAvailable(false);
        setListening(false);
        return;
      }
      const notifOk = await ensureAndroidNotificationPermission();
      if (cancelled) return;
      if (!notifOk) {
        console.warn('[WAKE] notifications denied - service may be limited');
      }
      setAvailable(true);

      try {
        await AndroidWakeWord.startListening();
      } catch (e) {
        console.warn('[WAKE] startListening failed', e);
        setAvailable(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useNative, hydrated, enabled, setAvailable, setListening]);

  // ================= iOS / fallback =================

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
      if (mountedRef.current && canListenInApp()) void startInAppListening();
    }, ms);
  };

  const stopInAppListening = (reason: 'pause' | 'unmount' | 'wake' = 'pause') => {
    intentionalStopRef.current = true;
    clearRestart();
    try {
      if (reason === 'unmount') ExpoSpeechRecognitionModule.abort();
      else ExpoSpeechRecognitionModule.stop();
    } catch {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    }
    setListening(false);
  };

  const startInAppListening = async () => {
    if (useNative) return;
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
      });
      setListening(true);
    } catch (e) {
      console.warn('[WAKE] in-app start failed', e);
      setAvailable(false);
      setListening(false);
      if (canListenInApp()) scheduleRestart(2500);
    } finally {
      startingRef.current = false;
    }
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (useNative) return;
    for (const item of event.results ?? []) {
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
    if (useNative) return;
    setListening(false);
    if (intentionalStopRef.current) {
      intentionalStopRef.current = false;
      return;
    }
    if (!canListenInApp()) return;
    scheduleRestart(3000);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (useNative) return;
    setListening(false);
    if (intentionalStopRef.current || event.error === 'aborted') {
      intentionalStopRef.current = false;
      return;
    }
    if (!canListenInApp()) return;
    scheduleRestart(event.error === 'no-speech' ? 2800 : 4000);
  });

  useEffect(() => {
    if (useNative || !hydrated) return;
    mountedRef.current = true;

    if (enabled && !pausedForRecording && !playbackActive) {
      void startInAppListening();
    } else {
      stopInAppListening('pause');
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (!useWakeWordStore.getState().enabled) return;
      if (
        state === 'active' &&
        !useWakeWordStore.getState().pausedForRecording &&
        !useWakeWordStore.getState().playbackActive
      ) {
        void startInAppListening();
      } else {
        stopInAppListening('pause');
      }
    });

    return () => {
      mountedRef.current = false;
      sub.remove();
      stopInAppListening('unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNative, hydrated, enabled, pausedForRecording, playbackActive]);
}
