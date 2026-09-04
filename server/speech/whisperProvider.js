import { transcriptFromWhisperSegments } from './hallucination.js';
import { buildLanguage } from './languages.js';

/** Native-script seed. English instructions bias Whisper to English. */
const AUTO_PROMPT = 'आज मौसम अच्छा है। आज मी ऑफिसला जाणार आहे. कल मुझे meeting के लिए जाना है।';

export function whisperConfigFromEnv() {
  const groq = process.env.GROQ_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (groq) {
    return {
      name: 'Groq',
      apiKey: groq,
      baseUrl: 'https://api.groq.com/openai/v1',
      sttModel: process.env.STT_MODEL || 'whisper-large-v3',
      responseFormat: 'verbose_json',
      chatModel: process.env.CHAT_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  if (openai) {
    return {
      name: 'OpenAI',
      apiKey: openai,
      baseUrl: 'https://api.openai.com/v1',
      sttModel: process.env.STT_MODEL || 'gpt-4o-transcribe',
      responseFormat: 'json',
      chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
    };
  }
  return null;
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Groq / OpenAI Whisper — language is omitted so the model auto-detects.
 * preferredLanguage is accepted but never forced into the upstream request.
 */
export async function transcribeWithWhisper(file, options = {}) {
  void options.preferredLanguage;
  void options.conversationId;

  const provider = whisperConfigFromEnv();
  if (!provider) {
    throw httpError('Server missing GROQ_API_KEY or OPENAI_API_KEY', 503);
  }
  if (!file?.buffer?.length) {
    throw httpError('Missing audio file (multipart field "audio" or "file")', 400);
  }

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
  if (file.size > maxBytes) {
    throw httpError(
      `Recording exceeds ${maxBytes} bytes. Split long audio into chunks (~10 min) server-side and stitch transcripts.`,
      413,
    );
  }

  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/mp4' });
  form.append('file', blob, file.originalname || 'idea.m4a');
  form.append('model', provider.sttModel);
  form.append('response_format', provider.responseFormat);
  form.append('temperature', '0');
  form.append('prompt', AUTO_PROMPT);

  const response = await fetch(`${provider.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    body: form,
  });

  const bodyText = await response.text();
  if (response.status === 429) {
    throw httpError('Upstream rate limit (429)', 429);
  }
  if (!response.ok) {
    throw httpError(
      `${provider.name} STT ${response.status}: ${bodyText.slice(0, 200)}`,
      response.status >= 400 && response.status < 600 ? response.status : 502,
    );
  }

  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw httpError(`${provider.name} returned an invalid transcription response`, 502);
  }

  const gated = transcriptFromWhisperSegments(
    json.text || '',
    json.language ? String(json.language).toLowerCase() : undefined,
    Array.isArray(json.segments) ? json.segments : [],
  );
  const transcription = gated.text;
  if (!transcription) {
    throw httpError('No speech detected in this recording. Try speaking more clearly.', 422);
  }

  const language = buildLanguage(gated.language, transcription);
  const duration =
    typeof json.duration === 'number' && Number.isFinite(json.duration)
      ? json.duration
      : undefined;

  return { transcription, language, duration };
}
