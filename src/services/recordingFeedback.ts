import { Vibration } from 'react-native';

/**
 * Haptic cues for recording start/stop.
 * (Voice TTS via expo-speech needs a native rebuild; toast already shows the message.)
 */
export async function announceRecordingStarted(): Promise<void> {
  try {
    Vibration.vibrate(50);
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
