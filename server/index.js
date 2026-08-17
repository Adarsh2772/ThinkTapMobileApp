/**
 * ThinkTap STT proxy — keeps Groq / OpenAI keys off the mobile binary.
 *
 * POST /api/transcribe  multipart field `file` → { text, language }
 * POST /api/enrich      multipart field `file` → { transcript, title, category, summary, aiStory, detectedLanguage }
 * GET  /health
 *
 * Long recordings (>25 MB): split into ~10-minute chunks server-side and stitch
 * with a prior-segment prompt (not implemented here — reject oversized uploads).
 *
 * Cost ballpark: Whisper / gpt-4o-transcribe ≈ $0.004–0.006 per audio minute.
 * Prefer Groq for MVP cost; OpenAI gpt-4o-transcribe for higher accuracy.
 */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const PORT = Number(process.env.PORT || 8787);
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);

const AUTO_PROMPT = [
  'Transcribe exactly what was spoken in the original language and script.',
  'Marathi must be written in Devanagari (मराठी), not romanized English letters.',
  'Hindi must be Devanagari. Do NOT translate into English.',
  'Code-mixing is OK. Preserve names, numbers, and punctuation.',
].join(' ');

function providerFromEnv() {
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  const provider = providerFromEnv();
  res.json({
    ok: true,
    provider: provider?.name ?? null,
    sttModel: provider?.sttModel ?? null,
    maxUploadBytes: MAX_BYTES,
  });
});

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const result = await runTranscribe(req.file);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/enrich', upload.single('file'), async (req, res) => {
  try {
    const stt = await runTranscribe(req.file);
    if (!stt.text) {
      res.status(422).json({ error: 'No speech detected in this recording. Try speaking more clearly.' });
      return;
    }
    const enrichment = await runEnrich(stt.text, stt.language || 'en');
    res.json({
      transcript: enrichment.transcript || stt.text,
      title: enrichment.title,
      category: enrichment.category,
      summary: enrichment.summary,
      aiStory: enrichment.aiStory || enrichment.summary,
      detectedLanguage: (stt.language || 'en').toLowerCase(),
    });
  } catch (error) {
    sendError(res, error);
  }
});

async function runTranscribe(file) {
  const provider = providerFromEnv();
  if (!provider) {
    const err = new Error('Server missing GROQ_API_KEY or OPENAI_API_KEY');
    err.status = 503;
    throw err;
  }
  if (!file?.buffer?.length) {
    const err = new Error('Missing audio file (multipart field "file")');
    err.status = 400;
    throw err;
  }
  if (file.size > MAX_BYTES) {
    const err = new Error(
      `Recording exceeds ${MAX_BYTES} bytes. Split long audio into chunks (~10 min) server-side and stitch transcripts.`,
    );
    err.status = 413;
    throw err;
  }

  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/mp4' });
  form.append('file', blob, file.originalname || 'idea.m4a');
  form.append('model', provider.sttModel);
  form.append('response_format', provider.responseFormat);
  form.append('temperature', '0');
  form.append('prompt', AUTO_PROMPT);
  // Intentionally omit `language` — auto-detect spoken language.

  const response = await fetch(`${provider.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    body: form,
  });

  const bodyText = await response.text();
  if (response.status === 429) {
    const err = new Error('Upstream rate limit (429)');
    err.status = 429;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`${provider.name} STT ${response.status}: ${bodyText.slice(0, 200)}`);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw err;
  }

  const json = JSON.parse(bodyText);
  return {
    text: String(json.text || '').trim(),
    language: json.language ? String(json.language).toLowerCase() : undefined,
  };
}

async function runEnrich(transcript, languageCode) {
  const provider = providerFromEnv();
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
The transcript below is already in the correct script — copy it into "transcript" unchanged.
Write title, summary, and aiStory in the same language/script as the transcript.
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
    return JSON.parse(content);
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
  res.status(status).json({ error: message });
}

app.listen(PORT, () => {
  const provider = providerFromEnv();
  console.log(
    `ThinkTap STT proxy on http://localhost:${PORT} (${provider ? provider.name + ' / ' + provider.sttModel : 'NO API KEY'})`,
  );
});
