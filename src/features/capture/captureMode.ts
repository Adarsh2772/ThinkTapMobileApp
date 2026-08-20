import { Platform } from 'react-native';

export type CaptureMode = 'audio-file' | 'device';

/**
 * Android 13+ (API 33+) can persist audio from the speech recognizer while
 * showing a live transcript. Older Android cannot share the mic between
 * expo-audio and speech recognition, so Settings offers a choice.
 * iOS / other platforms record with expo-audio and do not need that toggle.
 */
export function supportsAudioWithLiveTranscript(): boolean {
  if (Platform.OS !== 'android') return true;
  return Number(Platform.Version) >= 33;
}

/**
 * - `device`: OS speech recognition owns the mic (live text / spoken stop).
 * - `audio-file`: expo-audio owns the mic; transcript comes after Stop (e.g. Groq).
 */
export function resolveCaptureMode(preferSavedAudio: boolean): CaptureMode {
  if (supportsAudioWithLiveTranscript()) {
    return 'device';
  }
  return preferSavedAudio ? 'audio-file' : 'device';
}
