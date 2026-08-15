import {
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { matchesStopPhrase } from '@/src/features/wakeWord/phrases';
import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';
import {
  abortLiveRecognition,
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
  startLiveRecognition,
  stopLiveRecognition,
  stripTrailingStopCommand,
} from '@/src/services/languageTranscriptService';

type Options = {
  /** BCP-47 locale for OS STT */
  speechLocale: SpeechLocaleCode;
  enabled: boolean;
  onStopPhrase?: () => void;
};

/**
 * Live OS speech-to-text while recording.
 * Accumulates final segments + current interim; detects stop phrases in the same stream.
 *
 * Important: when disabled, do NOT abort the shared SpeechRecognizer — wake word owns the mic.
 */
export function useLanguageTranscript({ speechLocale, enabled, onStopPhrase }: Options) {
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef('');
  const onStopRef = useRef(onStopPhrase);
  onStopRef.current = onStopPhrase;

  const intentionalRef = useRef(false);
  const activeRef = useRef(false);
  const stopFiredRef = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const localeRef = useRef(speechLocale);
  localeRef.current = speechLocale;
  /** Prefer selected locale; every 3rd pass use en-US so English “stop” is heard. */
  const passCount = useRef(0);

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const publish = () => {
    const joined = finalsRef.current.join(' ').replace(/\s+/g, ' ').trim();
    setTranscript(joined);
    setInterim(interimRef.current);
  };

  const getFullTranscript = useCallback(() => {
    const parts = [...finalsRef.current];
    if (interimRef.current.trim()) parts.push(interimRef.current.trim());
    return stripTrailingStopCommand(parts.join(' ').replace(/\s+/g, ' ').trim());
  }, []);

  const stopListening = useCallback((abort = true) => {
    intentionalRef.current = true;
    clearRestart();
    activeRef.current = false;
    setListening(false);
    if (abort) abortLiveRecognition();
    else stopLiveRecognition();
  }, []);

  const startListening = useCallback(async () => {
    if (!enabledRef.current || stopFiredRef.current) return;
    try {
      const granted = await requestSpeechPermissions();
      if (!granted) {
        setError('Speech recognition permission is required to transcribe.');
        return;
      }
      if (!isSpeechRecognitionAvailable()) {
        setError('Speech recognition is unavailable on this device.');
        return;
      }

      // Ignore abort/end noise from tearing down the previous session.
      intentionalRef.current = true;
      abortLiveRecognition();
      await new Promise((r) => setTimeout(r, 250));
      if (!enabledRef.current || stopFiredRef.current) return;

      intentionalRef.current = false;
      setError(null);

      const isIndic = localeRef.current !== 'en-IN';
      // Prefer the selected Indian locale most of the time; briefly use en-US so
      // “stop” / “stop recording” are heard reliably.
      let lang: SpeechLocaleCode | 'en-US' = localeRef.current;
      if (isIndic && passCount.current % 3 === 2) {
        lang = 'en-US';
      }
      passCount.current += 1;

      startLiveRecognition({ lang });
      activeRef.current = true;
      setListening(true);
    } catch (e) {
      console.warn('Language transcript failed to start', e);
      setError(e instanceof Error ? e.message : 'Could not start transcription');
      intentionalRef.current = false;
      scheduleRestart(Platform.OS === 'android' ? 1200 : 800);
    }
  }, []);

  const scheduleRestart = (ms: number) => {
    clearRestart();
    restartTimer.current = setTimeout(() => {
      if (enabledRef.current && !stopFiredRef.current) void startListening();
    }, ms);
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (!enabledRef.current || stopFiredRef.current) return;

    const results = event.results ?? [];
    const top = results[0]?.transcript?.trim() ?? '';
    if (!top) return;

    if (matchesStopPhrase(top)) {
      stopFiredRef.current = true;
      if (event.isFinal) {
        const cleaned = stripTrailingStopCommand(top);
        if (cleaned) finalsRef.current.push(cleaned);
      }
      interimRef.current = '';
      publish();
      stopListening(true);
      onStopRef.current?.();
      return;
    }

    if (event.isFinal) {
      finalsRef.current.push(top);
      interimRef.current = '';
    } else {
      interimRef.current = top;
    }
    publish();
  });

  useSpeechRecognitionEvent('end', () => {
    activeRef.current = false;
    setListening(false);
    if (!enabledRef.current || intentionalRef.current || stopFiredRef.current) return;
    scheduleRestart(400);
  });

  useSpeechRecognitionEvent('error', (event) => {
    activeRef.current = false;
    setListening(false);
    if (!enabledRef.current || intentionalRef.current || stopFiredRef.current) return;
    const code = event?.error ?? '';
    if (code === 'aborted') return;
    if (code !== 'no-speech') {
      console.warn('Language transcript error', code);
    }
    scheduleRestart(Platform.OS === 'android' ? 1000 : 700);
  });

  useEffect(() => {
    stopFiredRef.current = false;
    passCount.current = 0; // reset English-stop rotation each session

    if (enabled) {
      finalsRef.current = [];
      interimRef.current = '';
      setTranscript('');
      setInterim('');
      setError(null);
      // Let expo-audio claim the mic first, then start OS STT.
      const t = setTimeout(() => void startListening(), 700);
      return () => {
        clearTimeout(t);
        stopListening(true);
      };
    }

    // Disabled: do NOT abort — Hey Think Tap / wake word owns the mic.
    clearRestart();
    intentionalRef.current = true;
    activeRef.current = false;
    setListening(false);
    return undefined;
  }, [enabled, speechLocale, startListening, stopListening]);

  const reset = useCallback(() => {
    finalsRef.current = [];
    interimRef.current = '';
    stopFiredRef.current = false;
    passCount.current = 0;
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return {
    transcript,
    interim,
    displayText: [transcript, interim].filter(Boolean).join(' ').trim(),
    listening,
    error,
    getFullTranscript,
    stopListening,
    reset,
  };
}
