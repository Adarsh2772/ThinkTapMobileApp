import { Platform } from 'react-native';

export type CaptureMode = 'live-transcript' | 'audio-file';

/**
 * Android 12 and below hand the microphone to a single owner: the moment an
 * app records to a file, the OS feeds the speech recognizer silence. Android 13+
 * streams our recording into the recognizer, so both work together there.
 */
export function supportsAudioWithLiveTranscript(): boolean {
  if (Platform.OS !== 'android') return true;
  return Number(Platform.Version) >= 33;
}

export function resolveCaptureMode(preferSavedAudio: boolean): CaptureMode {
  if (supportsAudioWithLiveTranscript()) return 'live-transcript';
  return preferSavedAudio ? 'audio-file' : 'live-transcript';
}
