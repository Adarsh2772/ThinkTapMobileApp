import { Platform, Vibration } from 'react-native';
import * as Speech from 'expo-speech';

import { AndroidWakeWord } from 'android-wake-word';
import { showToast } from '@/src/store/toastStore';

/** Cached female English voice id (null = none found). */
let cachedFemaleVoice: string | null | undefined;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveFemaleVoice(): Promise<string | undefined> {
  if (cachedFemaleVoice !== undefined) {
    return cachedFemaleVoice ?? undefined;
  }
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const english = voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
    const scored =
      english.find((v) =>
        /female|woman|girl|samantha|karen|moira|tessa|fiona|veena|zira|susan|jenny|aria|sara|serena|ava|allison/i.test(
          `${v.name} ${v.identifier}`,
        ),
      ) ??
      english.find((v) =>
        /en-us-x-sfg|en-gb-x-gba|en-au-x-afh|en-in-x-ena|en-us-x-tpf|en-us-x-sfc/i.test(
          v.identifier,
        ),
      ) ??
      english.find((v) => v.quality === Speech.VoiceQuality.Enhanced) ??
      english[0];
    cachedFemaleVoice = scored?.identifier ?? null;
    return scored?.identifier;
  } catch {
    cachedFemaleVoice = null;
    return undefined;
  }
}

/**
 * Speak with a female voice and resolve when idle.
 * Used AFTER the mic is closed (stop) so TTS is never captured.
 */
async function speakAsFemale(text: string): Promise<void> {
  try {
    const voice = await resolveFemaleVoice();
    await Speech.stop();
    await delay(40);

    let callbackEnded = false;
    const startedAt = Date.now();

    Speech.speak(text, {
      language: 'en-US',
      voice,
      pitch: voice ? 1.05 : 1.2,
      rate: 1.0,
      volume: 1,
      onDone: () => {
        callbackEnded = true;
      },
      onStopped: () => {
        callbackEnded = true;
      },
      onError: () => {
        callbackEnded = true;
      },
    });

    await delay(100);

    const minMs = 700;
    const maxMs = 2800;
    while (Date.now() - startedAt < maxMs) {
      let speaking = false;
      try {
        speaking = await Speech.isSpeakingAsync();
      } catch {
        speaking = false;
      }
      const elapsed = Date.now() - startedAt;
      if (!speaking && elapsed >= minMs && callbackEnded) {
        break;
      }
      if (!speaking && elapsed >= minMs + 400) {
        break;
      }
      await delay(80);
    }

    try {
      if (await Speech.isSpeakingAsync()) {
        await Speech.stop();
      }
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

async function vibrateStartCue(): Promise<void> {
  if (Platform.OS === 'android' && AndroidWakeWord.isSupported()) {
    try {
      const played = await AndroidWakeWord.playRecordingStartCue();
      if (played) return;
    } catch {
      // fall through
    }
  }
  try {
    Vibration.vibrate(80);
  } catch {
    // ignore
  }
}

async function vibrateStopCue(): Promise<void> {
  if (Platform.OS === 'android' && AndroidWakeWord.isSupported()) {
    try {
      const played = await AndroidWakeWord.playRecordingStopCue();
      if (played) return;
    } catch {
      // fall through
    }
  }
  try {
    Vibration.vibrate([0, 40, 60, 40]);
  } catch {
    // ignore
  }
}

/**
 * Instant start feedback — toast + vibrate only.
 * Do NOT await TTS here: that delayed the mic by ~2–3s and made start feel stuck.
 */
export async function announceRecordingStarted(): Promise<void> {
  showToast('Recording started');
  await vibrateStartCue();
}

/**
 * Toast + vibrate, then female voice AFTER the take is closed (mic already released).
 */
export async function announceRecordingStopped(): Promise<void> {
  showToast('Recording stopped');
  await vibrateStopCue();
  await speakAsFemale('Recording stopped');
}

/** Warm the TTS voice list in the background so stop announcements are snappy. */
export function prefetchRecordingVoice(): void {
  void resolveFemaleVoice();
}
