import { Platform } from 'react-native';

export type CaptureMode = 'audio-file' | 'device';

/**
 * Live transcript is attempted on every device. If the mic cannot be shared,
 * useIdeaCapture detects that at runtime and falls back to audio-file mode.
 * Do not branch on Platform.Version — OEM mic arbitration does not follow
 * the API-level rules.
 */
export function supportsAudioWithLiveTranscript(): boolean {
  return true;
}

/**
 * - `device`: try live speech recognition alongside expo-audio.
 * - `audio-file`: expo-audio owns the mic; transcript comes after Stop.
 *
 * Android always attempts `device`. Failure to share the mic is detected at
 * runtime in useIdeaCapture, not guessed from a version number.
 * iOS / other platforms honor the save-audio setting.
 */
export function resolveCaptureMode(preferSavedAudio: boolean): CaptureMode {
  if (Platform.OS === 'android') {
    return 'device';
  }
  return preferSavedAudio ? 'audio-file' : 'device';
}
