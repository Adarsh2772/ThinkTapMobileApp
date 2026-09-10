import { AndroidWakeWord } from 'android-wake-word';

import { abortLiveRecognition } from '@/src/services/languageTranscriptService';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitUntilWakePaused(timeoutMs: number): Promise<boolean> {
  if (!AndroidWakeWord.isSupported() || !AndroidWakeWord.isRunning()) {
    return true;
  }
  if (AndroidWakeWord.isPaused()) return true;
  try {
    await AndroidWakeWord.pauseService();
  } catch {
    // still poll below
  }
  const deadline = Date.now() + timeoutMs;
  while (!AndroidWakeWord.isPaused() && Date.now() < deadline) {
    await delay(80);
  }
  if (!AndroidWakeWord.isPaused()) {
    try {
      await AndroidWakeWord.pauseService();
    } catch {
      // ignore
    }
    await delay(200);
  }
  return AndroidWakeWord.isPaused();
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
    // Keep OEM recognizer cues muted for the upcoming take.
    AndroidWakeWord.silenceRecognitionUi();
    return;
  }

  try {
    await waitUntilWakePaused(1600);
  } catch {
    // still settle below
  }

  abortLiveRecognition();
  // Do not unmute here — recording / live STT restarts would beep on OPPO.
  AndroidWakeWord.silenceRecognitionUi();
  await delay(250);
}

/** Pause the wake FGS so Ideas playback can use the speaker. */
export async function releaseWakeMicForPlayback(): Promise<void> {
  useWakeWordStore.getState().setPlaybackActive(true);
  abortLiveRecognition();

  const wakeRunning =
    AndroidWakeWord.isSupported() && AndroidWakeWord.isRunning();
  if (!wakeRunning) {
    AndroidWakeWord.restoreRecognitionUi();
    await delay(200);
    return;
  }

  try {
    await waitUntilWakePaused(1600);
  } catch {
    // still restore below
  }
  AndroidWakeWord.restoreRecognitionUi();
  await delay(500);
}
