import { getInfoAsync } from 'expo-file-system/legacy';

import {
  backendBaseUrl,
  isCloudSttAvailable,
  mapSttError,
  MAX_STT_UPLOAD_BYTES,
  mimeAndName,
  uploadAudioMultipart,
} from '@/src/services/aiService';
import type { SpeechToTextError, SpeechToTextResult, SpeechUploadOptions } from '@/src/types/speech';

export { isCloudSttAvailable };

/**
 * POST /api/speech-to-text — auto-detect Indian language, keep original script.
 * Secrets stay on the backend. preferredLanguage is optional and never required.
 */
export async function transcribeAudio(options: SpeechUploadOptions): Promise<SpeechToTextResult> {
  const apiBase = backendBaseUrl();
  if (!apiBase) {
    throw new Error('Speech-to-text backend is not configured. Set EXPO_PUBLIC_API_URL.');
  }

  const info = await getInfoAsync(options.audioUri);
  if (!info.exists) {
    throw new Error('Recording file not found on device');
  }
  if (typeof info.size === 'number' && info.size === 0) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }
  if (typeof info.size === 'number' && info.size > MAX_STT_UPLOAD_BYTES) {
    throw new Error('Recording is too long for transcription (max ~25 MB).');
  }

  const { mime, name: fileName } = mimeAndName(options.audioUri);
  const fields: Record<string, string> = {};
  if (options.preferredLanguage?.trim()) {
    fields.preferredLanguage = options.preferredLanguage.trim();
  }
  if (options.conversationId?.trim()) {
    fields.conversationId = options.conversationId.trim();
  }

  let uploadResult;
  try {
    uploadResult = await uploadAudioMultipart({
      url: `${apiBase}/api/speech-to-text`,
      audioUri: options.audioUri,
      mime,
      fileName,
      fieldName: 'audio',
      fields,
    });
  } catch (error) {
    throw mapSttError(error);
  }

  if (uploadResult.status === 429) {
    throw mapSttError(new Error('Backend rate limit (429)'));
  }
  if (uploadResult.status === 413) {
    throw mapSttError(new Error('Recording is too long for transcription (max ~25 MB).'));
  }
  if (uploadResult.status === 422) {
    throw mapSttError(new Error('No speech detected in this recording. Try speaking more clearly.'));
  }
  if (uploadResult.status === 503) {
    throw mapSttError(new Error('Speech-to-text provider is unavailable. Check the server configuration.'));
  }
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw mapSttError(
      new Error(`Backend speech-to-text error ${uploadResult.status}: ${uploadResult.body.slice(0, 180)}`),
    );
  }

  let json: SpeechToTextResult | SpeechToTextError;
  try {
    json = JSON.parse(uploadResult.body) as SpeechToTextResult | SpeechToTextError;
  } catch {
    throw mapSttError(new Error('invalid transcription response'));
  }

  if ('error' in json && json.error) {
    throw mapSttError(new Error(json.error));
  }
  if (!('transcription' in json) || typeof json.transcription !== 'string') {
    throw mapSttError(new Error('Speech-to-text failed'));
  }

  const transcription = json.transcription.replace(/\s+/g, ' ').trim();
  if (!transcription) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  return {
    success: true,
    transcription,
    language: json.language,
    audio: json.audio,
  };
}
