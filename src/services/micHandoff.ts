import { AndroidWakeWord } from 'android-wake-word';

import { abortLiveRecognition } from '@/src/services/languageTranscriptService';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Android allows only one SpeechRecognizer. Pause the wake-word service
 * (keep the FGS alive so minimized capture can still hear “stop”) and wait
 * until its recognizer is gone before idea capture takes the mic.
 *
 * When Hey Think Tap is off, skip the settle delays so Record starts immediately.
 */
export async function releaseWakeMicForCapture(): Promise<void> {
  useWakeWordStore.getState().setPausedForRecording(true);
  abortLiveRecognition();

  const wakeRunning =
    AndroidWakeWord.isSupported() && AndroidWakeWord.isRunning();
  if (!wakeRunning) {
    AndroidWakeWord.restoreRecognitionUi();
    return;
  }

  try {
    if (!AndroidWakeWord.isPaused()) {
      await AndroidWakeWord.pauseService();
    }
    const deadline = Date.now() + 700;
    while (!AndroidWakeWord.isPaused() && Date.now() < deadline) {
      await delay(60);
    }
  } catch {
    // still restore below
  }

  abortLiveRecognition();
  AndroidWakeWord.restoreRecognitionUi();
  await delay(200);
}
