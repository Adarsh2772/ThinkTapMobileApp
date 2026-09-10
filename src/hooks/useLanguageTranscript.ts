import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { detectSpeechLocaleFromText } from '@/src/features/languageTranscript/detectLanguage';
import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';
import {
  flushInterimToFinals,
  mergeTranscriptSegment,
  normalizeTranscriptText,
} from '@/src/features/languageTranscript/transcriptMerge';
import {
  matchesPausePhrase,
  matchesResumePhrase,
  matchesStopPhrase,
} from '@/src/features/wakeWord/phrases';
import {
  abortLiveRecognition,
  allVoiceCommandContextualStrings,
  autoSpeechLocaleFallbackChain,
  clearSpeechLocaleCache,
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
  listVoiceCommandLocales,
  startLiveRecognition,
  stopLiveRecognition,
  stripTrailingStopCommand,
} from '@/src/services/languageTranscriptService';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import {
  SAFE_SPEECH_LOCALE_FALLBACK,
} from '@/src/features/languageTranscript/locales';

type Options = {
  /** Session is open (recording or paused). */
  enabled: boolean;
  /** When true, spoken words are added to the idea transcript. */
  capturing: boolean;
  onStopPhrase?: () => void;
  onPausePhrase?: () => void;
  onResumePhrase?: () => void;
};

function normalize(text: string): string {
  return normalizeTranscriptText(text);
}

function resolvePreferredSpeechLocale(
  locales: (SpeechLocaleCode | 'en-US')[],
): SpeechLocaleCode | 'en-US' {
  const wakeLocale = useWakeWordStore.getState().lastWakeLocale;
  const settingsLocale = useSettingsStore.getState().speechLocale;
  const candidates = [wakeLocale, settingsLocale].filter(
    (code): code is SpeechLocaleCode | 'en-US' => !!code,
  );
  for (const preferred of candidates) {
    if (locales.includes(preferred)) return preferred;
    return preferred;
  }
  return locales[0] ?? SAFE_SPEECH_LOCALE_FALLBACK[0] ?? 'en-IN';
}

/**
 * Live OS speech-to-text for idea capture.
 * Locale is auto-selected from installed device packs — not tied to Settings.
 */
export function useLanguageTranscript({
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
  const autoChainRef = useRef(autoSpeechLocaleFallbackChain());
  const voiceLocalesRef = useRef<(SpeechLocaleCode | 'en-US')[]>(autoChainRef.current);
  const voiceLocaleIndexRef = useRef(0);
  const activeLocaleRef = useRef<SpeechLocaleCode | 'en-US'>('hi-IN');
  const localeExhaustedRef = useRef(false);
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

    const merged = mergeTranscriptSegment(
      { finals: finalsRef.current, interim: interimRef.current },
      text,
      asFinal,
    );
    finalsRef.current = merged.finals;
    interimRef.current = merged.interim;
    publish();
  };

  const commitInterimRef = useRef(() => {});

  const commitInterim = () => {
    const flushed = flushInterimToFinals({
      finals: finalsRef.current,
      interim: interimRef.current,
    });
    finalsRef.current = flushed.finals;
    interimRef.current = flushed.interim;
    publish();
  };
  commitInterimRef.current = commitInterim;

  const getFullTranscript = useCallback(() => {
    const parts = [...finalsRef.current];
    if (interimRef.current.trim()) parts.push(interimRef.current.trim());
    return stripTrailingStopCommand(normalize(parts.join(' ')));
  }, []);

  const getAudioUri = useCallback(() => audioUriRef.current, []);

  const getDetectedSpeechLocale = useCallback((): SpeechLocaleCode | 'en-US' => {
    return detectSpeechLocaleFromText(getFullTranscript(), activeLocaleRef.current);
  }, [getFullTranscript]);

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
    if (!enabledRef.current || stopFiredRef.current || localeExhaustedRef.current) return;
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

      if (!fromRestart) {
        localeExhaustedRef.current = false;
        let locales = await listVoiceCommandLocales();
        const preferred = resolvePreferredSpeechLocale(locales);
        if (!locales.includes(preferred)) {
          locales = [preferred, ...locales];
        }
        voiceLocalesRef.current = locales;
        voiceLocaleIndexRef.current = Math.max(0, locales.indexOf(preferred));
        activeLocaleRef.current = preferred;
        useWakeWordStore.getState().clearLastWakeLocale();
      }
      // Routine restarts keep the same locale — only rotate on language-not-supported.

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
        contextualStrings: allVoiceCommandContextualStrings(),
        outputFileName: `idea-${Date.now()}-${fileSeq.current}.wav`,
        persist: persistRef.current,
      });
      console.log('[SPEECH] recognition started locale=', activeLocaleRef.current);
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

  const finalizeSession = (commitInterimOnEnd: boolean) => {
    if (commitInterimOnEnd && capturingRef.current) {
      commitInterim();
    }
    nativeActiveRef.current = false;
    setListening(false);
    notifyEnded();
  };

  const maybeRestartSession = (restartMs: number) => {
    if (!enabledRef.current || stopFiredRef.current) return;
    scheduleRestart(restartMs);
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (nativeGenRef.current !== genRef.current) return;

    const results = event.results ?? [];
    const top = results[0]?.transcript?.trim() ?? '';
    if (!top) return;

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
      commitInterimRef.current();
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
    finalizeSession(true);
    maybeRestartSession(capturingRef.current ? 1000 : 2500);
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
    const code = event?.error ?? '';
    if (code === 'aborted') {
      finalizeSession(false);
      return;
    }
    finalizeSession(true);
    if (!enabledRef.current || stopFiredRef.current) return;
    if (code === 'language-not-supported') {
      const locales = voiceLocalesRef.current;
      const next = voiceLocaleIndexRef.current + 1;
      if (next < locales.length) {
        voiceLocaleIndexRef.current = next;
        activeLocaleRef.current = locales[next]!;
        clearSpeechLocaleCache();
        maybeRestartSession(800);
        return;
      }
      localeExhaustedRef.current = true;
      setError(
        'No speech language pack is installed. Install Hindi or English in your phone speech settings.',
      );
      return;
    }
    if (code === 'client' || code === 'busy' || code === 'audio-capture' || code === 'network') {
      persistRef.current = false;
      maybeRestartSession(Platform.OS === 'android' ? 800 : 600);
      return;
    }
    if (code !== 'no-speech' && code !== 'speech-timeout') {
      console.warn('Language transcript error', code);
    }
    maybeRestartSession(code === 'no-speech' ? 1200 : 800);
  });

  const commitPendingTranscript = useCallback(() => {
    commitInterimRef.current();
  }, []);

  useEffect(() => {
    stopFiredRef.current = false;
    pauseFiredRef.current = false;
    resumeFiredRef.current = false;
    persistRef.current = true;
    startAttempts.current = 0;
    localeExhaustedRef.current = false;
    voiceLocaleIndexRef.current = 0;

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
  }, [enabled, startListening, stopListening]);

  const reset = useCallback(() => {
    finalsRef.current = [];
    interimRef.current = '';
    audioUriRef.current = null;
    stopFiredRef.current = false;
    pauseFiredRef.current = false;
    resumeFiredRef.current = false;
    persistRef.current = true;
    startAttempts.current = 0;
    localeExhaustedRef.current = false;
    voiceLocaleIndexRef.current = 0;
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
    getDetectedSpeechLocale,
    getAudioUri,
    waitForIdle,
    stopListening,
    reset,
    commitPendingTranscript,
  };
}
