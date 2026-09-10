import { AndroidWakeWord } from 'android-wake-word';
import { Platform } from 'react-native';

import { abortLiveRecognition } from '@/src/services/languageTranscriptService';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Free the mic for idea capture.
 *
 * Previously always waited ~1.4s (900+500) even when wake was already stopped —
 * that is the ~2s "pause" after tapping Start on both Android 11 and 15.
 * Settle only when a wake recognizer was actually torn down.
 */
export async function releaseWakeMicForCapture(): Promise<void> {
  const t0 = Date.now();
  console.log(`RECORDING: mic release begin: ${t0}`);
  useWakeWordStore.getState().setPausedForRecording(true);
  abortLiveRecognition();

  let toreDownWake = false;
  try {
    if (
      Platform.OS === 'android' &&
      AndroidWakeWord.isSupported() &&
      AndroidWakeWord.isRunning()
    ) {
      toreDownWake = true;
      console.log('WAKE_WORD: stopping service for capture handoff');
      await AndroidWakeWord.stopService();
      const deadline = Date.now() + 600;
      while (AndroidWakeWord.isRunning() && Date.now() < deadline) {
        await delay(40);
      }
    }
  } catch {
    // still abort JS recognition below
  }

  abortLiveRecognition();
  if (Platform.OS === 'android' && AndroidWakeWord.isSupported()) {
    AndroidWakeWord.restoreRecognitionUi();
  }

  if (toreDownWake) {
    // Brief settle only after real FGS teardown — not a fixed multi-second sleep.
    await delay(120);
    abortLiveRecognition();
  }

  console.log(`RECORDING: mic release complete in ${Date.now() - t0}ms toreDownWake=${toreDownWake}`);
}
