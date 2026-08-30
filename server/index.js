/**
 * ThinkTap STT proxy — keeps Groq / OpenAI keys off the mobile binary.
 *
 * POST /api/speech-to-text  multipart `audio` or `file` → transcription + language
 * POST /api/transcribe      multipart `file` → { text, language } (compat)
 * POST /api/enrich          multipart `file` → enrichment + detectedLanguage
 * GET  /health
 *
 * Language is never forced into Whisper — the model auto-detects.
 */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { speechProviderStatus, transcribeAudio, whisperConfigFromEnv } from './speech/index.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const PORT = Number(process.env.PORT || 8787);
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

const uploadAudio = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function pickAudioFile(req) {
  return req.files?.audio?.[0] ?? req.files?.file?.[0] ?? req.file ?? null;
}

function transcribeOptions(req) {
  return {
    preferredLanguage: typeof req.body?.preferredLanguage === 'string' ? req.body.preferredLanguage : undefined,
    conversationId: typeof req.body?.conversationId === 'string' ? req.body.conversationId : undefined,
  };
}

app.get('/health', (_req, res) => {
  const speech = speechProviderStatus();
  const whisper = whisperConfigFromEnv();
  res.json({
    ok: true,
    provider: speech.name,
    speechProvider: speech.id,
    sttModel: speech.sttModel,
    configured: speech.configured,
    chatProvider: whisper?.name ?? null,
    maxUploadBytes: MAX_BYTES,
  });
});

app.post('/api/speech-to-text', uploadAudio, async (req, res) => {
  try {
    const result = await transcribeAudio(pickAudioFile(req), transcribeOptions(req));
    res.json({
      success: true,
      transcription: result.transcription,
      language: result.language,
      audio: result.duration != null ? { duration: result.duration } : undefined,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/transcribe', uploadAudio, async (req, res) => {
  try {
    const result = await transcribeAudio(pickAudioFile(req), transcribeOptions(req));
    res.json({
      text: result.transcription,
      language: result.language?.code,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/enrich', uploadAudio, async (req, res) => {
  try {
    const stt = await transcribeAudio(pickAudioFile(req), transcribeOptions(req));
    const languageCode = stt.language?.code || 'en';
    const enrichment = await runEnrich(stt.transcription, languageCode);
    res.json({
      transcript: enrichment.transcript || stt.transcription,
      title: enrichment.title,
      category: enrichment.category,
      summary: enrichment.summary,
      aiStory: enrichment.aiStory || enrichment.summary,
      detectedLanguage: languageCode.toLowerCase(),
    });
  } catch (error) {
    sendError(res, error);
  }
});

async function runEnrich(transcript, languageCode) {
  const provider = whisperConfigFromEnv();
  if (!provider) {
    return localEnrich(transcript, languageCode);
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.chatModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You organize voice ideas for Think Tap.
Detected spoken language code: ${languageCode}.
Copy the transcript into "transcript" EXACTLY. Do not translate. Do not transliterate.
Write title, summary, and aiStory in the SAME language and script as the transcript.
If Hindi/Marathi is mixed with English, keep that mix.
Keep category in English from: Movies, Songs, Books, Business, Scripts, Design, Music.
Title: max 8 words. Summary: 1-2 sentences from the transcript only.
Return JSON: { "transcript": string, "title": string, "category": string, "summary": string, "aiStory": string }`,
        },
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
    }),
  });

  if (!response.ok) {
    return localEnrich(transcript, languageCode);
  }

  const chatJson = await response.json();
  const content = chatJson.choices?.[0]?.message?.content;
  if (!content) return localEnrich(transcript, languageCode);
  try {
    const parsed = JSON.parse(content);
    return {
      ...parsed,
      transcript,
    };
  } catch {
    return localEnrich(transcript, languageCode);
  }
}

function localEnrich(transcript, languageCode) {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  const title = cleaned.split(/[.!?।]/)[0]?.trim().split(/\s+/).slice(0, 8).join(' ') || 'Untitled Idea';
  return {
    transcript: cleaned,
    title: title.length > 48 ? `${title.slice(0, 45)}...` : title,
    category: 'Business',
    summary: cleaned.length <= 220 ? cleaned : `${cleaned.slice(0, 217)}...`,
    aiStory: cleaned.length <= 220 ? cleaned : `${cleaned.slice(0, 217)}...`,
    detectedLanguage: languageCode,
  };
}

function sendError(res, error) {
  const status = error?.status || 500;
  const message = error instanceof Error ? error.message : 'Server error';
  console.error('[thinktap-stt]', message);
  res.status(status).json({ error: message, success: false });
}

app.listen(PORT, () => {
  const speech = speechProviderStatus();
  console.log(
    `ThinkTap STT proxy on http://localhost:${PORT} (${speech.name} / ${speech.sttModel ?? 'NO MODEL'} — ${speech.configured ? 'ready' : 'NOT CONFIGURED'})`,
  );
});
