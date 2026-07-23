import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { matchesWakePhrase } from '@/src/features/wakeWord/phrases';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Listens for "Hey Think Tap" while enabled.
 * Uses device speech recognition (same idea as OneTap SpeechRecognizer).
 * Best with a development build; limited / unavailable in Expo Go.
 */
function canListen(): boolean {
  const s = useWakeWordStore.getState();
  return (
    s.enabled &&
    !s.pausedForRecording &&
    AppState.currentState === 'active'
  );
}

export function useWakeWordListener() {
  const enabled = useWakeWordStore((s) => s.enabled);
  const hydrated = useWakeWordStore((s) => s.hydrated);
  const pausedForRecording = useWakeWordStore((s) => s.pausedForRecording);
  const setListening = useWakeWordStore((s) => s.setListening);
  const setAvailable = useWakeWordStore((s) => s.setAvailable);
  const setLastHeard = useWakeWordStore((s) => s.setLastHeard);
  const fireWakeTrigger = useWakeWordStore((s) => s.fireWakeTrigger);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const stopListening = () => {
    clearRestart();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // ignore
    }
    setListening(false);
  };

  const startListening = async () => {
    if (!canListen()) return;
    try {
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

      if (!canListen()) return;

      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: Platform.OS === 'android' ? true : false,
        addsPunctuation: false,
        contextualStrings: [
          'Hey Think Tap',
          'Think Tap',
          'start recording',
          'ThinkTap',
        ],
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'web_search',
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
        },
      });
      setListening(true);
    } catch (e) {
      console.warn('Wake word start failed', e);
      setAvailable(false);
      setListening(false);
    }
  };

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    setLastHeard(transcript);
    if (matchesWakePhrase(transcript)) {
      fireWakeTrigger();
      // Pause wake listening while recording starts.
      stopListening();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    if (!canListen()) return;
    // Restart listen loop (Android continuous can still end; iOS always ends).
    clearRestart();
    restartTimer.current = setTimeout(() => {
      if (canListen()) {
        void startListening();
      }
    }, 600);
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('Wake word error', event.error, event.message);
    setListening(false);
    if (!canListen()) return;
    clearRestart();
    restartTimer.current = setTimeout(() => {
      if (canListen()) {
        void startListening();
      }
    }, 1200);
  });

  useEffect(() => {
    if (!hydrated) return;

    if (enabled && !pausedForRecording) {
      void startListening();
    } else {
      stopListening();
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (!useWakeWordStore.getState().enabled) return;
      if (state === 'active' && !useWakeWordStore.getState().pausedForRecording) {
        void startListening();
      } else {
        // Foreground-focused MVP: pause when backgrounded.
        // Full pocket/screen-off wake word needs Android ForegroundService (Phase 5b).
        stopListening();
      }
    });

    return () => {
      sub.remove();
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated, pausedForRecording]);
}
