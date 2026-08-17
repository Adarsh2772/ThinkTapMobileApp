import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  matchesPausePhrase,
  matchesResumePhrase,
  matchesStopPhrase,
} from '@/src/features/wakeWord/phrases';
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
  speechLocale: SpeechLocaleCode;
  /** Session is open (recording or paused). */
  enabled: boolean;
  /** When true, spoken words are added to the idea transcript. */
  capturing: boolean;
  onStopPhrase?: () => void;
  onPausePhrase?: () => void;
  onResumePhrase?: () => void;
};

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Live OS speech-to-text for idea capture.
 * Session generation ignores stale abort/end events so take #2+ can start.
 */
export function useLanguageTranscript({
  speechLocale,
  enabled,
  capturing,
  onStopPhrase,
  onPausePhrase,
  onResumePhrase,
}: Options) {
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef('');
  const audioUriRef = useRef<string | null>(null);
  const onStopRef = useRef(onStopPhrase);
  const onPauseRef = useRef(onPausePhrase);
  const onResumeRef = useRef(onResumePhrase);
  onStopRef.current = onStopPhrase;
  onPauseRef.current = onPausePhrase;
  onResumeRef.current = onResumePhrase;

  const genRef = useRef(0);
  const nativeGenRef = useRef(0);
  const nativeActiveRef = useRef(false);
  const stopFiredRef = useRef(false);
  const pauseFiredRef = useRef(false);
  const resumeFiredRef = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endWaiters = useRef<Array<() => void>>([]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const capturingRef = useRef(capturing);
  capturingRef.current = capturing;
  const localeRef = useRef(speechLocale);
  localeRef.current = speechLocale;
  const fileSeq = useRef(0);
  const persistRef = useRef(true);
  const startAttempts = useRef(0);
  const startingRef = useRef(false);

  const clearRestart = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const notifyEnded = () => {
    const waiters = endWaiters.current;
    endWaiters.current = [];
    waiters.forEach((fn) => fn());
  };

  const publish = () => {
    setTranscript(normalize(finalsRef.current.join(' ')));
    setInterim(interimRef.current);
  };

  const commitText = (incoming: string, asFinal: boolean) => {
    const text = normalize(incoming);
    if (!text) {
      if (asFinal) interimRef.current = '';
      publish();
      return;
    }

    const committed = normalize(finalsRef.current.join(' '));

    if (!asFinal) {
      if (committed && text.startsWith(committed)) {
        interimRef.current = text.slice(committed.length).trim();
      } else {
        interimRef.current = text;
      }
      publish();
      return;
    }

    if (!committed) {
      finalsRef.current = [text];
    } else if (text.startsWith(committed)) {
      const rest = text.slice(committed.length).trim();
      if (rest) finalsRef.current.push(rest);
    } else if (committed.endsWith(text) || text === committed) {
      // duplicate final from the engine — ignore
    } else {
      finalsRef.current.push(text);
    }
    interimRef.current = '';
    publish();
  };

  const commitInterimRef = useRef(() => {});

  const commitInterim = () => {
    if (interimRef.current.trim()) {
      commitText(interimRef.current, true);
    }
  };
  commitInterimRef.current = commitInterim;

  const getFullTranscript = useCallback(() => {
    const parts = [...finalsRef.current];
    if (interimRef.current.trim()) parts.push(interimRef.current.trim());
    return stripTrailingStopCommand(normalize(parts.join(' ')));
  }, []);

  const getAudioUri = useCallback(() => audioUriRef.current, []);

  const waitForIdle = useCallback((timeoutMs = 2000) => {
    if (!nativeActiveRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        resolve();
      }, timeoutMs);
      endWaiters.current.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }, []);

  const stopListening = useCallback((abort = true) => {
    commitInterimRef.current();
    clearRestart();
    setListening(false);
    if (abort) {
      nativeActiveRef.current = false;
      genRef.current += 1;
      abortLiveRecognition();
      notifyEnded();
    } else {
      stopFiredRef.current = true;
      stopLiveRecognition();
    }
  }, []);

  const startListening = useCallback(async (fromRestart = false) => {
    if (!enabledRef.current || stopFiredRef.current) return;
    startingRef.current = true;
    const gen = fromRestart ? genRef.current : ++genRef.current;

    try {
      const granted = await requestSpeechPermissions();
      if (!granted) {
        startingRef.current = false;
        setError('Speech recognition permission is required to transcribe.');
        return;
      }
      if (!isSpeechRecognitionAvailable()) {
        startingRef.current = false;
        setError('Speech recognition is unavailable on this device.');
        return;
      }

      abortLiveRecognition();
      await new Promise((r) => setTimeout(r, fromRestart ? 900 : 800));
      if (gen !== genRef.current || !enabledRef.current || stopFiredRef.current) {
        startingRef.current = false;
        return;
      }

      setError(null);
      fileSeq.current += 1;
      nativeGenRef.current = gen;
      nativeActiveRef.current = true;
      await startLiveRecognition({
        lang: localeRef.current,
        outputFileName: `idea-${Date.now()}-${fileSeq.current}.wav`,
        persist: persistRef.current,
      });
      if (gen !== genRef.current || !enabledRef.current) {
        nativeActiveRef.current = false;
        startingRef.current = false;
        abortLiveRecognition();
        return;
      }
      setListening(true);
      startingRef.current = false;
    } catch (e) {
      console.warn('Language transcript failed to start', e);
      nativeActiveRef.current = false;
      persistRef.current = false;
      startingRef.current = false;
      setError(e instanceof Error ? e.message : 'Could not start transcription');
      if (gen === genRef.current && enabledRef.current && !stopFiredRef.current) {
        startAttempts.current += 1;
        const wait = Math.min(2500, 900 + startAttempts.current * 400);
        scheduleRestart(wait);
      }
    }
  }, []);

  const scheduleRestart = (ms: number) => {
    clearRestart();
    restartTimer.current = setTimeout(() => {
      if (enabledRef.current && !stopFiredRef.current) void startListening(true);
    }, ms);
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (nativeGenRef.current !== genRef.current) return;

    const results = event.results ?? [];
    const top = results[0]?.transcript?.trim() ?? '';
    if (!top) return;

    // After Stop, still accept the engine's final flush so the last words are kept.
    if (stopFiredRef.current) {
      commitText(stripTrailingStopCommand(top), true);
      return;
    }

    if (!enabledRef.current) return;

    if (matchesStopPhrase(top)) {
      stopFiredRef.current = true;
      commitText(stripTrailingStopCommand(top), true);
      stopListening(false);
      onStopRef.current?.();
      return;
    }

    if (capturingRef.current && matchesPausePhrase(top)) {
      if (pauseFiredRef.current) return;
      pauseFiredRef.current = true;
      resumeFiredRef.current = false;
      commitText(stripTrailingStopCommand(top), true);
      onPauseRef.current?.();
      return;
    }

    if (!capturingRef.current && matchesResumePhrase(top)) {
      if (resumeFiredRef.current) return;
      resumeFiredRef.current = true;
      pauseFiredRef.current = false;
      onResumeRef.current?.();
      return;
    }

    if (!capturingRef.current) return;
    commitText(top, Boolean(event.isFinal));
  });

  useSpeechRecognitionEvent('audioend', (event) => {
    const uri = event?.uri;
    if (typeof uri === 'string' && uri.trim()) {
      audioUriRef.current = uri;
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (startingRef.current) {
      notifyEnded();
      return;
    }
    if (nativeGenRef.current !== genRef.current) {
      nativeActiveRef.current = false;
      notifyEnded();
      return;
    }
    commitInterim();
    nativeActiveRef.current = false;
    setListening(false);
    notifyEnded();
    if (!enabledRef.current || stopFiredRef.current) return;
    scheduleRestart(500);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (startingRef.current) {
      notifyEnded();
      return;
    }
    if (nativeGenRef.current !== genRef.current) {
      nativeActiveRef.current = false;
      notifyEnded();
      return;
    }
    commitInterim();
    nativeActiveRef.current = false;
    setListening(false);
    notifyEnded();
    if (!enabledRef.current || stopFiredRef.current) return;
    const code = event?.error ?? '';
    if (code === 'aborted') return;
    if (code === 'client' || code === 'busy' || code === 'audio-capture' || code === 'network') {
      persistRef.current = false;
      scheduleRestart(Platform.OS === 'android' ? 1400 : 800);
      return;
    }
    if (code !== 'no-speech') {
      console.warn('Language transcript error', code);
    }
    scheduleRestart(Platform.OS === 'android' ? 900 : 600);
  });

  useEffect(() => {
    stopFiredRef.current = false;
    pauseFiredRef.current = false;
    resumeFiredRef.current = false;
    persistRef.current = true;
    startAttempts.current = 0;

    if (enabled) {
      const t = setTimeout(() => void startListening(false), 200);
      return () => {
        clearTimeout(t);
        stopListening(true);
      };
    }

    clearRestart();
    setListening(false);
    notifyEnded();
    return undefined;
  }, [enabled, speechLocale, startListening, stopListening]);

  const reset = useCallback(() => {
    finalsRef.current = [];
    interimRef.current = '';
    audioUriRef.current = null;
    stopFiredRef.current = false;
    pauseFiredRef.current = false;
    resumeFiredRef.current = false;
    persistRef.current = true;
    startAttempts.current = 0;
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
    getAudioUri,
    waitForIdle,
    stopListening,
    reset,
  };
}
