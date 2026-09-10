import { AndroidWakeWord } from 'android-wake-word';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import { matchesStopPhrase } from '@/src/features/wakeWord/phrases';

type SpeechResultEvent = {
  results?: Array<{ transcript?: string }>;
};

/**
 * One short en-US listen for “stop recording”.
 * Caller must already have released the mic (file recorder suspended).
 */
export async function listenOnceForStopPhrase(timeoutMs = 2500): Promise<boolean> {
  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return false;
  } catch {
    return false;
  }

  if (Platform.OS === 'android') {
    AndroidWakeWord.silenceRecognitionUi();
  }

  return new Promise((resolve) => {
    let settled = false;
    const subs: Array<{ remove: () => void }> = [];

    const finish = (heard: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => {
        try {
          s.remove();
        } catch {
          // ignore
        }
      });
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
      resolve(heard);
    };

    const onResult = (event: SpeechResultEvent) => {
      for (const item of event.results ?? []) {
        const text = item?.transcript?.trim() ?? '';
        if (!text) continue;
        if (matchesStopPhrase(text)) {
          finish(true);
          return;
        }
        // Next sentence of the idea — give the mic back.
        if (text.split(/\s+/).length >= 3 || text.length > 14) {
          finish(false);
        }
      }
    };

    subs.push(ExpoSpeechRecognitionModule.addListener('result', onResult));
    subs.push(ExpoSpeechRecognitionModule.addListener('error', () => finish(false)));
    subs.push(ExpoSpeechRecognitionModule.addListener('end', () => finish(false)));

    const timer = setTimeout(() => finish(false), timeoutMs);

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        addsPunctuation: false,
        contextualStrings: [
          'stop',
          'stop recording',
          'stop the recording',
          'please stop',
          'end recording',
          'finish recording',
        ],
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1800,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1800,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 250,
        },
      });
    } catch {
      finish(false);
    }
  });
}
