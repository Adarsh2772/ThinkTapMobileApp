export type CaptureMode = 'audio-file' | 'device';

/** Android 13 (API 33) can keep recognizer audio; below that mic is exclusive. */
export const ANDROID_LIVE_TRANSCRIPT_WITH_AUDIO_API = 33;

/**
 * Pure helper for tests — no react-native import.
 * - Non-Android: always supports combined live transcript path.
 * - Android: only API 33+ can persist recognizer audio while showing live text.
 */
export function supportsAudioWithLiveTranscriptForApi(
  os: string,
  apiLevel: number,
): boolean {
  if (os !== 'android') return true;
  return apiLevel >= ANDROID_LIVE_TRANSCRIPT_WITH_AUDIO_API;
}

/**
 * Resolve mic ownership for a capture take.
 * - `device`: OS speech recognition owns the mic (live text / spoken stop).
 * - `audio-file`: expo-audio owns the mic; transcript comes after Stop (e.g. Groq).
 *
 * On Android API < 33 the mic cannot be shared. Preferring saved audio therefore
 * disables live transcription entirely — that is the Android 11 vs 15 divergence.
 */
export function resolveCaptureModeFor(
  preferSavedAudio: boolean,
  os: string,
  apiLevel: number,
): CaptureMode {
  if (supportsAudioWithLiveTranscriptForApi(os, apiLevel)) {
    return 'device';
  }
  return preferSavedAudio ? 'audio-file' : 'device';
}

/**
 * Default for "Save audio recording" when the user has never set it.
 * On Android < 33, default OFF so live transcription works out of the box
 * (OPPO A51 / Android 11). On API 33+ the toggle is unused for capture mode.
 */
export function defaultSaveAudioRecordingForApi(os: string, apiLevel: number): boolean {
  if (os !== 'android') return false;
  return supportsAudioWithLiveTranscriptForApi(os, apiLevel);
}
