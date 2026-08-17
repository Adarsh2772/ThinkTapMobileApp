import { AndroidWakeWord } from 'android-wake-word';

import { abortLiveRecognition } from '@/src/services/languageTranscriptService';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Android allows only one SpeechRecognizer. The wake-word service must be fully
 * stopped (not merely paused) before idea capture can hear the mic.
 */
export async function releaseWakeMicForCapture(): Promise<void> {
  useWakeWordStore.getState().setPausedForRecording(true);
  abortLiveRecognition();

  try {
    if (AndroidWakeWord.isSupported() && AndroidWakeWord.isRunning()) {
      await AndroidWakeWord.stopServiceSilent();
      const deadline = Date.now() + 2500;
      while (AndroidWakeWord.isRunning() && Date.now() < deadline) {
        await delay(120);
      }
    }
  } catch {
    // still abort JS recognition below
  }

  abortLiveRecognition();
  AndroidWakeWord.silenceRecognitionUi();
  await delay(900);
  abortLiveRecognition();
  AndroidWakeWord.silenceRecognitionUi();
  await delay(500);
}
