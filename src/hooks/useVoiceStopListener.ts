import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { matchesStopPhrase } from '@/src/features/wakeWord/phrases';
import { useSettingsStore } from '@/src/store/settingsStore';
import { getLanguage } from '@/src/i18n/languages';

function speechLangForStop(appCode: string): string {
  // Prefer English for the word "stop", but use Indic locales when app is hi/mr
  // so "थांबा" / "बंद" are recognized too. We restart alternating if needed.
  const lang = getLanguage(appCode);
  if (lang.code === 'mr') return 'mr-IN';
  if (lang.code === 'hi') return 'hi-IN';
  return 'en-US';
}

/**
 * Listens for "Stop" / "थांबा" while expo-audio is recording.
 * Restarts often so a single missed session does not block stop forever.
 */
export function useVoiceStopListener(enabled: boolean, onStop: () => void) {
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  const languageCode = useSettingsStore((s) => s.languageCode);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalRef = useRef(false);
  const activeRef = useRef(false);
  const firedRef = useRef(false);
  const useEnglishPass = useRef(true);

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const stopListening = () => {
    intentionalRef.current = true;
    clearRestart();
    activeRef.current = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // ignore
    }
  };

  const startListening = async () => {
    if (!enabled || firedRef.current) return;
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return;
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return;

      intentionalRef.current = false;

      // Alternate en-US (hears "stop") and app locale (hears थांबा) when Indic.
      const isIndic = languageCode === 'mr' || languageCode === 'hi';
      const lang = isIndic
        ? useEnglishPass.current
          ? 'en-US'
          : speechLangForStop(languageCode)
        : 'en-US';
      useEnglishPass.current = !useEnglishPass.current;

      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
        addsPunctuation: false,
        contextualStrings: [
          'stop',
          'stop recording',
          'please stop',
          'थांबा',
          'थांब',
          'बंद करा',
          'बंद',
        ],
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 400,
        },
      });
      activeRef.current = true;
    } catch (e) {
      console.warn('Voice stop listener failed to start', e);
      scheduleRestart(1800);
    }
  };

  const scheduleRestart = (ms: number) => {
    clearRestart();
    restartTimer.current = setTimeout(() => {
      if (enabled && !firedRef.current) void startListening();
    }, ms);
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (!enabled || firedRef.current) return;
    for (const item of event.results ?? []) {
      const transcript = item?.transcript?.trim() ?? '';
      if (!transcript) continue;
      if (matchesStopPhrase(transcript)) {
        firedRef.current = true;
        stopListening();
        onStopRef.current();
        return;
      }
    }
  });

  useSpeechRecognitionEvent('end', () => {
    activeRef.current = false;
    if (!enabled || intentionalRef.current || firedRef.current) return;
    scheduleRestart(400);
  });

  useSpeechRecognitionEvent('error', () => {
    activeRef.current = false;
    if (!enabled || intentionalRef.current || firedRef.current) return;
    // Mic may be busy with the recorder — keep retrying.
    scheduleRestart(Platform.OS === 'android' ? 1200 : 800);
  });

  useEffect(() => {
    firedRef.current = false;
    if (enabled) {
      // Let expo-audio take the mic first, then start stop-listening.
      const t = setTimeout(() => void startListening(), 600);
      return () => {
        clearTimeout(t);
        stopListening();
      };
    }
    stopListening();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, languageCode]);
}
