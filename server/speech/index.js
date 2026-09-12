import { bharatGenConfigured, transcribeWithBharatGen } from './bharatGenProvider.js';
import { whisperConfigFromEnv, transcribeWithWhisper } from './whisperProvider.js';

export function speechProviderId() {
  const raw = (process.env.SPEECH_PROVIDER || 'whisper').trim().toLowerCase();
  return raw === 'bharatgen' ? 'bharatgen' : 'whisper';
}

export function speechProviderStatus() {
  const id = speechProviderId();
  if (id === 'bharatgen') {
    return {
      id,
      name: 'BharatGen',
      configured: bharatGenConfigured(),
      sttModel: process.env.BHARATGEN_SPEECH_MODEL?.trim() || null,
    };
  }
  const whisper = whisperConfigFromEnv();
  return {
    id,
    name: whisper?.name ?? 'Whisper',
    configured: Boolean(whisper),
    sttModel: whisper?.sttModel ?? null,
  };
}

export async function transcribeAudio(file, options = {}) {
  if (speechProviderId() === 'bharatgen') {
    return transcribeWithBharatGen(file, options);
  }
  return transcribeWithWhisper(file, options);
}

export { whisperConfigFromEnv };
