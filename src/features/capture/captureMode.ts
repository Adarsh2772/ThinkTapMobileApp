import { Platform } from 'react-native';

import {
  defaultSaveAudioRecordingForApi,
  resolveCaptureModeFor,
  supportsAudioWithLiveTranscriptForApi,
  type CaptureMode,
} from './captureModeLogic';

export type { CaptureMode };
export {
  ANDROID_LIVE_TRANSCRIPT_WITH_AUDIO_API,
  defaultSaveAudioRecordingForApi,
  resolveCaptureModeFor,
  supportsAudioWithLiveTranscriptForApi,
} from './captureModeLogic';

/**
 * Android 13+ (API 33+) can persist audio from the speech recognizer while
 * showing a live transcript. Older Android cannot share the mic between
 * expo-audio and speech recognition, so Settings offers a choice.
 */
export function supportsAudioWithLiveTranscript(): boolean {
  return supportsAudioWithLiveTranscriptForApi(
    Platform.OS,
    Number(Platform.Version),
  );
}

export function resolveCaptureMode(preferSavedAudio: boolean): CaptureMode {
  return resolveCaptureModeFor(
    preferSavedAudio,
    Platform.OS,
    Number(Platform.Version),
  );
}

export function defaultSaveAudioRecording(): boolean {
  return defaultSaveAudioRecordingForApi(Platform.OS, Number(Platform.Version));
}
