import { Platform } from 'react-native';

export type CaptureMode = 'audio-file' | 'device';

/**
 * Kept for compatibility with Settings copy. Live preview during recording is
 * disabled in this build (see resolveCaptureMode), so this no longer gates the
 * capture path.
 */
export function supportsAudioWithLiveTranscript(): boolean {
  if (Platform.OS !== 'android') return true;
  return Number(Platform.Version) >= 33;
}

/**
 * ONE capture mode on every Android version.
 *
 * WHY: the previous build branched on Platform.Version (>= 33 used the OS
 * recognizer as the microphone owner, below that used expo-audio). That gave
 * three code paths, and the audio file only existed on some of them — so a
 * take could be lost entirely if transcription failed.
 *
 * Now expo-audio always owns the microphone and always writes the file. The
 * transcript is produced after Stop from that file. Live preview during
 * recording is removed: it was inaccurate mid-sentence and distracting, and it
 * was the reason the recognizer had to hold the mic in the first place.
 *
 * Result: identical behaviour on Android 8 through 15+, no version checks in
 * the capture path, and a recording that survives Stop on every device.
 */
export function resolveCaptureMode(_preferSavedAudio: boolean): CaptureMode {
  if (Platform.OS === 'android') return 'audio-file';
  return 'audio-file';
}
