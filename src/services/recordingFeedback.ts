import { AndroidWakeWord } from 'android-wake-word';
import { Platform, Vibration } from 'react-native';

/**
 * Confirmation cue when a take actually starts.
 * Wake-word listening stays silent — no chime/haptic on SpeechRecognizer restarts.
 */
export async function announceRecordingStarted(): Promise<void> {
  if (Platform.OS === 'android' && AndroidWakeWord.isSupported()) {
    try {
      const played = await AndroidWakeWord.playRecordingStartCue();
      if (played) return;
    } catch {
      // fall through to JS haptic
    }
  }
  try {
    Vibration.vibrate(80);
  } catch {
    // ignore
  }
}

export async function announceRecordingStopped(): Promise<void> {
  try {
    Vibration.vibrate([0, 40, 60, 40]);
  } catch {
    // ignore
  }
}
