import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

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
  /** The engine cannot run at all — the take must not stay open pretending to record. */
  onUnavailable?: (message: string) => void;
  /** Mic stolen (phone call / audio focus) — pause the take, do not restart STT. */
  onInterrupted?: () => void;
  /** Real words arrived — used to reset the 10s silence auto-pause. */
  onSpeechActivity?: () => void;
};

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function isIndicLocale(locale: string): boolean {
  return /^(hi|mr|bn|te|ta|gu|kn|ml|pa|or|as|ur)-/i.test(locale);
}

/**
 * When the chosen Indian locale is missing a speech pack, try a sibling Indic
 * locale — never silent-fallback to English (that produces "me office la jaat ahe").
 */
function fallbackChainFor(primary: SpeechLocaleCode): Array<SpeechLocaleCode | 'en-US'> {
  if (primary === 'en-IN' || primary === 'en-US') {
    return (['en-IN', 'en-US'] as const).filter((l) => l !== primary);
  }
  if (primary === 'hi-IN') return ['mr-IN'];
  if (primary === 'mr-IN') return ['hi-IN'];
  if (isIndicLocale(primary)) return ['hi-IN'];
  return [];
}

/** Prefer a Devanagari hypothesis when the user asked for Hindi/Marathi. */
function pickBestTranscript(
  results: Array<{ transcript?: string } | undefined>,
  locale: string,
): string {
  const texts = results
    .map((item) => item?.transcript?.trim() ?? '')
    .filter(Boolean);
  if (!texts.length) return '';
  if (locale === 'hi-IN' || locale === 'mr-IN') {
    const native = texts.find(isDevanagari);
    if (native) return native;
  }
  return texts[0];
}

/**
 * Merge overlapping STT finals. Google often re-emits the whole utterance with
 * small edits — prefix-only merge drops Marathi/Hindi words.
 */
function mergeTranscript(committed: string, incoming: string): string {
  const prev = normalize(committed);
  const next = normalize(incoming);
  if (!prev) return next;
  if (!next) return prev;
  if (next === prev) return prev;
  if (prev.endsWith(next)) return prev;
  if (next.startsWith(prev)) return next;

  const prevCompact = prev.replace(/\s+/g, '');
  const nextCompact = next.replace(/\s+/g, '');
  if (nextCompact.startsWith(prevCompact)) return next;
  if (prevCompact.startsWith(nextCompact)) return prev;
  if (nextCompact.includes(prevCompact) && next.length >= prev.length) return next;
  if (prevCompact.includes(nextCompact) && prev.length >= next.length) return prev;

  const prevWords = prev.split(' ');
  for (let n = Math.min(6, prevWords.length); n >= 1; n -= 1) {
    const tail = prevWords.slice(-n).join(' ');
    if (tail.length >= 2 && next.startsWith(tail)) {
      return normalize(`${prevWords.slice(0, -n).join(' ')} ${next}`);
    }
  }

  return normalize(`${prev} ${next}`);
}

const LANGUAGE_UNAVAILABLE_MESSAGE =
  'Speech recognition for this language is not installed on your device. ' +
  'Open Settings → Transcription language and download Hindi/Marathi, or pick another language.';

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
  onUnavailable,
  onInterrupted,
  onSpeechActivity,
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
  const onUnavailableRef = useRef(onUnavailable);
  const onInterruptedRef = useRef(onInterrupted);
  const onSpeechActivityRef = useRef(onSpeechActivity);
  onStopRef.current = onStopPhrase;
  onPauseRef.current = onPausePhrase;
  onResumeRef.current = onResumePhrase;
  onUnavailableRef.current = onUnavailable;
  onInterruptedRef.current = onInterrupted;
  onSpeechActivityRef.current = onSpeechActivity;

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
  /** Locale actually handed to the engine — may be downgraded to a fallback. */
  const activeLocaleRef = useRef<SpeechLocaleCode | 'en-US'>(speechLocale);
  const fallbackIndexRef = useRef(-1);
  /** Set when no locale works: further restarts would just spin forever. */
  const fatalRef = useRef(false);
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
      // A spoken command strips down to nothing. Finalising that empty string
      // must not discard words the engine is still holding as interim — those
      // words are the idea the user just dictated.
      if (asFinal) {
        const pending = stripTrailingStopCommand(interimRef.current);
        interimRef.current = '';
        if (pending.trim()) {
          commitText(pending, true);
          return;
        }
      }
      publish();
      return;
    }

    const committed = normalize(finalsRef.current.join(' '));

    if (!asFinal) {
      // Prefer the longest evolving hypothesis (Indic engines rewrite often).
      if (committed && text.startsWith(committed)) {
        interimRef.current = text.slice(committed.length).trim();
      } else if (committed && text.replace(/\s+/g, '').startsWith(committed.replace(/\s+/g, ''))) {
        interimRef.current = text;
        // Treat as a full rewrite of the open utterance.
        finalsRef.current = [];
      } else {
        interimRef.current = text;
      }
      publish();
      return;
    }

    if (!committed) {
      finalsRef.current = [text];
    } else {
      finalsRef.current = [mergeTranscript(committed, text)];
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
    if (!enabledRef.current || stopFiredRef.current || fatalRef.current) return;
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

      // Android ends a session on every silence gap. Aborting a session that is
      // already torn down only adds deaf time, so settle just long enough for the
      // engine to release the mic when one is actually running.
      const settleMs = nativeActiveRef.current ? 450 : fromRestart ? 120 : 250;
      if (nativeActiveRef.current) abortLiveRecognition();
      await new Promise((r) => setTimeout(r, settleMs));
      if (gen !== genRef.current || !enabledRef.current || stopFiredRef.current) {
        startingRef.current = false;
        return;
      }

      setError(null);
      fileSeq.current += 1;
      nativeGenRef.current = gen;
      nativeActiveRef.current = true;
      await startLiveRecognition({
        lang: activeLocaleRef.current,
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
      if (enabledRef.current && !stopFiredRef.current && !fatalRef.current) {
        void startListening(true);
      }
    }, ms);
  };

  /**
   * The device has no speech model for this language. Step to a sibling Indic
   * locale — never English, which romanizes Hindi/Marathi speech.
   */
  const handleLanguageUnavailable = () => {
    const chain = fallbackChainFor(localeRef.current);
    const nextIndex = chain.findIndex(
      (loc, i) => i > fallbackIndexRef.current && loc !== activeLocaleRef.current,
    );
    if (nextIndex >= 0) {
      fallbackIndexRef.current = nextIndex;
      activeLocaleRef.current = chain[nextIndex];
      if (__DEV__) {
        console.log('[STT] locale fallback', localeRef.current, '→', activeLocaleRef.current);
      }
      scheduleRestart(400);
      return;
    }
    fatalRef.current = true;
    clearRestart();
    setListening(false);
    setError(LANGUAGE_UNAVAILABLE_MESSAGE);
    onUnavailableRef.current?.(LANGUAGE_UNAVAILABLE_MESSAGE);
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (nativeGenRef.current !== genRef.current) return;

    const results = event.results ?? [];
    const top = pickBestTranscript(results, activeLocaleRef.current);
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
    onSpeechActivityRef.current?.();
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
    scheduleRestart(150);
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
    if (code === 'language-not-supported' || code === 'service-not-allowed') {
      handleLanguageUnavailable();
      return;
    }
    if (code === 'audio-capture') {
      persistRef.current = false;
      // Phone calls steal the mic. App-switch also kills STT after we already
      // paused — do not mark that as a call or returning to the app stays paused.
      if (AppState.currentState !== 'active' && capturingRef.current) {
        onInterruptedRef.current?.();
        return;
      }
      if (AppState.currentState !== 'active') return;
      scheduleRestart(Platform.OS === 'android' ? 800 : 600);
      return;
    }
    if (code === 'client' || code === 'busy' || code === 'network') {
      persistRef.current = false;
      scheduleRestart(Platform.OS === 'android' ? 800 : 600);
      return;
    }
    if (code !== 'no-speech' && code !== 'speech-timeout') {
      console.warn('Language transcript error', code);
    }
    scheduleRestart(150);
  });

  useEffect(() => {
    stopFiredRef.current = false;
    pauseFiredRef.current = false;
    resumeFiredRef.current = false;
    persistRef.current = true;
    startAttempts.current = 0;
    fatalRef.current = false;
    fallbackIndexRef.current = -1;
    activeLocaleRef.current = speechLocale;

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

  const wasCapturingRef = useRef(capturing);
  useEffect(() => {
    const was = wasCapturingRef.current;
    wasCapturingRef.current = capturing;
    if (
      !was &&
      capturing &&
      enabled &&
      !nativeActiveRef.current &&
      !startingRef.current &&
      !stopFiredRef.current &&
      !fatalRef.current
    ) {
      scheduleRestart(300);
    }
  }, [capturing, enabled]);

  // While minimized the native service owns the mic. When we return, start
  // live transcription again so spoken stop and the transcript keep working.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        clearRestart();
        return;
      }
      if (
        state === 'active' &&
        enabledRef.current &&
        capturingRef.current &&
        !stopFiredRef.current &&
        !fatalRef.current &&
        !nativeActiveRef.current &&
        !startingRef.current
      ) {
        scheduleRestart(700);
      }
    });
    return () => sub.remove();
  }, []);

  const reset = useCallback(() => {
    finalsRef.current = [];
    interimRef.current = '';
    audioUriRef.current = null;
    stopFiredRef.current = false;
    pauseFiredRef.current = false;
    resumeFiredRef.current = false;
    persistRef.current = true;
    startAttempts.current = 0;
    fatalRef.current = false;
    fallbackIndexRef.current = -1;
    activeLocaleRef.current = localeRef.current;
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
