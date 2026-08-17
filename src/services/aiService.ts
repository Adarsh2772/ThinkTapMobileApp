import { File, UploadType } from 'expo-file-system';
import { getInfoAsync } from 'expo-file-system/legacy';

import {
  resolveSpokenLanguage,
  type AppLanguageCode,
  type SpokenLanguage,
} from '@/src/i18n/languages';
import { hasDevanagari } from '@/src/features/wakeWord/phrases';
import { useAiConfigStore } from '@/src/store/aiConfigStore';
import type { AiEnrichment } from '@/src/types';

export type EnrichmentResult = AiEnrichment & {
  source: 'live' | 'demo' | 'device';
};

/** Max upload size for cloud STT (Whisper / gpt-4o-transcribe limit is ~25 MB). */
export const MAX_STT_UPLOAD_BYTES = 25 * 1024 * 1024;

const CATEGORY_HINTS: { category: string; keywords: string[] }[] = [
  { category: 'Movies', keywords: ['movie', 'film', 'scene', 'director', 'script', 'cinema'] },
  { category: 'Music', keywords: ['music', 'song', 'beat', 'melody', 'drum', 'bass', 'rain'] },
  { category: 'Business', keywords: ['business', 'startup', 'app', 'market', 'customer', 'product'] },
  { category: 'Design', keywords: ['design', 'poster', 'ui', 'brand', 'visual', 'layout'] },
  { category: 'Books', keywords: ['book', 'novel', 'chapter', 'story', 'character'] },
  { category: 'Scripts', keywords: ['dialogue', 'screenplay', 'act', 'monologue'] },
  { category: 'Songs', keywords: ['lyrics', 'verse', 'chorus', 'rap'] },
];

const MOCK_BY_LANGUAGE: Record<
  AppLanguageCode,
  { transcript: string; title: string; summary: string; category: string }
> = {
  en: {
    title: 'Creative Project Spark',
    category: 'Business',
    transcript:
      'I just had an idea for a short creative project. Capture the mood first, keep the structure simple, and expand the details later when I have more time.',
    summary:
      'A short creative project idea: start with mood, keep structure simple, and add details later.',
  },
  hi: {
    title: 'रचनात्मक प्रोजेक्ट आइडिया',
    category: 'Business',
    transcript:
      'मेरे पास एक छोटे रचनात्मक प्रोजेक्ट का आइडिया है। पहले मूड कैप्चर करें, संरचना सरल रखें, और बाद में विवरण जोड़ें।',
    summary: 'एक छोटा रचनात्मक प्रोजेक्ट: पहले मूड, सरल संरचना, बाद में विवरण।',
  },
  mr: {
    title: 'सर्जनशील प्रकल्प कल्पना',
    category: 'Business',
    transcript:
      'मला एका छोट्या सर्जनशील प्रकल्पाची कल्पना आली. आधी मूड कॅप्चर करा, रचना साधी ठेवा आणि नंतर तपशील वाढवा.',
    summary: 'छोटा सर्जनशील प्रकल्प: मूड प्रथम, साधी रचना, नंतर तपशील.',
  },
  fr: {
    title: 'Idée de projet créatif',
    category: 'Business',
    transcript:
      "Je viens d'avoir une idée pour un petit projet créatif. Capturer d'abord l'ambiance, garder une structure simple, puis développer les détails plus tard.",
    summary:
      "Petit projet créatif : commencer par l'ambiance, structure simple, détails plus tard.",
  },
  es: {
    title: 'Idea de proyecto creativo',
    category: 'Business',
    transcript:
      'Acabo de tener una idea para un proyecto creativo corto. Captura primero el ambiente, mantén la estructura simple y amplía los detalles después.',
    summary:
      'Proyecto creativo corto: primero el ambiente, estructura simple y detalles después.',
  },
  de: {
    title: 'Kreative Projektidee',
    category: 'Business',
    transcript:
      'Ich hatte gerade eine Idee für ein kurzes Kreativprojekt. Zuerst die Stimmung einfangen, die Struktur einfach halten und Details später ausbauen.',
    summary:
      'Kurzes Kreativprojekt: zuerst Stimmung, einfache Struktur, Details später.',
  },
  pt: {
    title: 'Ideia de projeto criativo',
    category: 'Business',
    transcript:
      'Acabei de ter uma ideia para um projeto criativo curto. Capturar primeiro o clima, manter a estrutura simples e expandir os detalhes depois.',
    summary:
      'Projeto criativo curto: primeiro o clima, estrutura simples, detalhes depois.',
  },
  ar: {
    title: 'فكرة مشروع إبداعي',
    category: 'Business',
    transcript:
      'خطر ببالي للتو فكرة لمشروع إبداعي قصير. التقط المزاج أولاً، حافظ على بنية بسيطة، ثم أضف التفاصيل لاحقاً.',
    summary: 'مشروع إبداعي قصير: المزاج أولاً، بنية بسيطة، ثم التفاصيل.',
  },
  zh: {
    title: '创意项目灵感',
    category: 'Business',
    transcript: '我刚想到一个短小的创意项目。先抓住氛围，保持结构简单，之后再补充细节。',
    summary: '短小创意项目：先氛围，结构简单，细节稍后补充。',
  },
  ja: {
    title: 'クリエイティブ企画のアイデア',
    category: 'Business',
    transcript:
      '短いクリエイティブプロジェクトのアイデアが浮かびました。まず雰囲気を捉え、構成はシンプルに保ち、詳細は後で広げます。',
    summary: '短い企画：まず雰囲気、シンプルな構成、詳細は後で。',
  },
};

function guessCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const hint of CATEGORY_HINTS) {
    if (hint.keywords.some((k) => lower.includes(k))) return hint.category;
  }
  return 'Business';
}

function titleFromTranscript(transcript: string): string {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Untitled Idea';
  const firstSentence = cleaned.split(/[.!?।]/)[0]?.trim() ?? cleaned;
  const words = firstSentence.split(/\s+/).slice(0, 8).join(' ');
  return words.length > 48 ? `${words.slice(0, 45)}...` : words || 'Untitled Idea';
}

function summaryFromTranscript(transcript: string): string {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Voice note captured in Think Tap.';
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 217)}...`;
}

/**
 * Enrich an idea from an OS (device) transcript — no Whisper / LLM APIs.
 * Uses the same local title / category / summary heuristics as demo mode.
 */
export function enrichIdeaFromDeviceTranscript(input: {
  transcript: string;
  /** BCP-47 locale e.g. hi-IN → stored as hi */
  speechLocale?: string;
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void;
}): EnrichmentResult {
  input.onStage?.('transcribing');
  const transcript = input.transcript.replace(/\s+/g, ' ').trim();
  if (!transcript) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  input.onStage?.('extracting');
  const title = titleFromTranscript(transcript);
  const category = guessCategory(transcript);

  input.onStage?.('summarizing');
  const summary = summaryFromTranscript(transcript);
  const localeTag = (input.speechLocale ?? '').trim();
  const detectedLanguage =
    localeTag.split(/[-_]/)[0]?.toLowerCase() ||
    resolveSpokenLanguage(undefined).whisperCode;

  return {
    transcript,
    title,
    category,
    summary,
    aiStory: summary,
    detectedLanguage,
    source: 'device',
  };
}

function mimeAndName(uri: string): { mime: string; name: string } {
  const lower = uri.toLowerCase();
  if (lower.includes('.wav')) return { mime: 'audio/wav', name: 'idea.wav' };
  if (lower.includes('.mp3')) return { mime: 'audio/mpeg', name: 'idea.mp3' };
  if (lower.includes('.webm')) return { mime: 'audio/webm', name: 'idea.webm' };
  if (lower.includes('.3gp')) return { mime: 'audio/3gpp', name: 'idea.3gp' };
  return { mime: 'audio/mp4', name: 'idea.m4a' };
}

function backendBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

/**
 * Convert recorded audio → text (Whisper) + title/summary (LLM).
 * Auto-detects spoken language — no manual language selection for STT.
 * Supports Groq (gsk_…) free tier, OpenAI (sk-…), or production backend proxy.
 */
export async function enrichIdeaFromAudio(input: {
  audioUri: string;
  durationSec: number;
  /** UI language only — used for demo mocks / fallback display, never forced into Whisper. */
  languageCode?: AppLanguageCode;
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void;
}): Promise<EnrichmentResult> {
  const uiLanguageCode = input.languageCode ?? 'en';
  input.onStage?.('transcribing');

  const apiBase = backendBaseUrl();
  if (apiBase) {
    try {
      const live = await enrichViaBackend(apiBase, input.audioUri, input.onStage);
      return { ...live, source: 'live' };
    } catch (error) {
      console.warn('Backend transcription failed', error);
      throw mapSttError(error);
    }
  }

  const apiKey = useAiConfigStore.getState().getApiKey();
  if (apiKey) {
    try {
      const live = await enrichWithCloudStt(apiKey, input.audioUri, uiLanguageCode, input.onStage);
      return { ...live, source: 'live' };
    } catch (error) {
      console.warn('Live transcription failed', error);
      throw mapSttError(error);
    }
  }

  await delay(600);
  input.onStage?.('extracting');
  await delay(500);
  input.onStage?.('summarizing');
  await delay(400);

  const mock = MOCK_BY_LANGUAGE[uiLanguageCode] ?? MOCK_BY_LANGUAGE.en;
  return {
    transcript: mock.transcript,
    title: mock.title,
    category: mock.category,
    summary: mock.summary,
    aiStory: mock.summary,
    detectedLanguage: uiLanguageCode,
    source: 'demo',
  };
}

/** Prompt Whisper to keep the spoken language — never force English. */
export function whisperPromptFor(languageName: string | 'auto'): string {
  if (languageName === 'auto') {
    return [
      'Transcribe exactly what was spoken in the original language and script.',
      'Marathi must be written in Devanagari (मराठी), not romanized English letters.',
      'Hindi must be Devanagari. Do NOT translate into English.',
      'Code-mixing is OK. Preserve names, numbers, and punctuation.',
    ].join(' ');
  }
  return [
    `Transcribe in ${languageName} using the correct script.`,
    `If the language is Marathi or Hindi, use Devanagari only — never romanize.`,
    'Do NOT translate into English. Preserve names, numbers, and punctuation.',
  ].join(' ');
}

function providerConfig(apiKey: string) {
  const isGroq = apiKey.startsWith('gsk_');
  if (isGroq) {
    return {
      name: 'Groq' as const,
      baseUrl: 'https://api.groq.com/openai/v1',
      whisperModel: 'whisper-large-v3',
      /** Groq Whisper returns language with verbose_json */
      responseFormat: 'verbose_json' as const,
      chatModel: 'llama-3.3-70b-versatile',
    };
  }
  return {
    name: 'OpenAI' as const,
    baseUrl: 'https://api.openai.com/v1',
    whisperModel: 'gpt-4o-transcribe',
    /** gpt-4o-transcribe supports json/text; language may still be returned */
    responseFormat: 'json' as const,
    chatModel: 'gpt-4o-mini',
  };
}

export function mapSttError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error('Speech-to-text failed. Check your API key and network.');
  }
  const msg = error.message;
  if (/429|rate limit/i.test(msg)) {
    return new Error('Speech-to-text rate limited. Wait a moment and try again.');
  }
  if (/401|403|invalid.*api.?key|incorrect api key/i.test(msg)) {
    return new Error('Speech-to-text API key is invalid. Update it in Settings.');
  }
  if (/network|fetch failed|Failed to fetch|ECONNREFUSED|timed out|timeout/i.test(msg)) {
    return new Error('Network error during speech-to-text. Check your connection and retry.');
  }
  if (/25\s*MB|file too large|payload too large|413/i.test(msg)) {
    return new Error(
      'Recording is too long for transcription (max ~25 MB). Record a shorter clip or enable server-side chunking.',
    );
  }
  if (/No speech detected/i.test(msg)) {
    return error;
  }
  return error;
}

async function whisperTranscribe(
  provider: ReturnType<typeof providerConfig>,
  apiKey: string,
  audioUri: string,
  mime: string,
): Promise<{ text: string; language?: string }> {
  const audioFile = new File(audioUri);
  // Omit `language` so the model auto-detects the spoken language.
  const parameters: Record<string, string> = {
    model: provider.whisperModel,
    temperature: '0',
    prompt: whisperPromptFor('auto'),
    response_format: provider.responseFormat,
  };

  let uploadResult: { status: number; body: string };
  try {
    uploadResult = await audioFile.upload(`${provider.baseUrl}/audio/transcriptions`, {
      uploadType: UploadType.MULTIPART,
      httpMethod: 'POST',
      fieldName: 'file',
      mimeType: mime,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      parameters,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `${provider.name} upload failed (network)`,
    );
  }

  if (uploadResult.status === 429) {
    throw new Error(`${provider.name} rate limit (429): ${uploadResult.body.slice(0, 180)}`);
  }
  if (uploadResult.status === 401 || uploadResult.status === 403) {
    throw new Error(`${provider.name} auth error ${uploadResult.status}: invalid API key`);
  }
  if (uploadResult.status === 413) {
    throw new Error(`${provider.name} file too large (413)`);
  }
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(
      `${provider.name} Whisper error ${uploadResult.status}: ${uploadResult.body.slice(0, 180)}`,
    );
  }

  try {
    const json = JSON.parse(uploadResult.body) as { text?: string; language?: string };
    return {
      text: cleanTranscript(json.text ?? ''),
      language: json.language,
    };
  } catch {
    throw new Error(`${provider.name} returned an invalid transcription response`);
  }
}

async function enrichViaBackend(
  apiBase: string,
  audioUri: string,
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void,
): Promise<AiEnrichment> {
  const info = await getInfoAsync(audioUri);
  if (!info.exists) {
    throw new Error('Recording file not found on device');
  }
  if (typeof info.size === 'number' && info.size > MAX_STT_UPLOAD_BYTES) {
    throw new Error('Recording is too long for transcription (max ~25 MB).');
  }

  const { mime } = mimeAndName(audioUri);
  const audioFile = new File(audioUri);

  onStage?.('transcribing');
  let uploadResult: { status: number; body: string };
  try {
    uploadResult = await audioFile.upload(`${apiBase}/api/enrich`, {
      uploadType: UploadType.MULTIPART,
      httpMethod: 'POST',
      fieldName: 'file',
      mimeType: mime,
      parameters: {},
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Backend upload failed (network)');
  }

  if (uploadResult.status === 429) {
    throw new Error('Backend rate limit (429)');
  }
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Backend enrich error ${uploadResult.status}: ${uploadResult.body.slice(0, 180)}`);
  }

  onStage?.('extracting');
  onStage?.('summarizing');

  const json = JSON.parse(uploadResult.body) as Partial<AiEnrichment> & {
    error?: string;
  };
  if (json.error) {
    throw new Error(json.error);
  }
  const transcript = cleanTranscript(json.transcript ?? '');
  if (!transcript) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  return {
    transcript,
    title: json.title || titleFromTranscript(transcript),
    category: json.category || guessCategory(transcript),
    summary: json.summary || summaryFromTranscript(transcript),
    aiStory: json.aiStory || json.summary || summaryFromTranscript(transcript),
    detectedLanguage: (json.detectedLanguage || 'en').toLowerCase(),
  };
}

async function enrichWithCloudStt(
  apiKey: string,
  audioUri: string,
  uiLanguageCode: AppLanguageCode,
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void,
): Promise<AiEnrichment> {
  const info = await getInfoAsync(audioUri);
  if (!info.exists) {
    throw new Error('Recording file not found on device');
  }
  if (typeof info.size === 'number' && info.size > MAX_STT_UPLOAD_BYTES) {
    throw new Error(
      'Recording is too long for transcription (max ~25 MB). Record a shorter clip or enable server-side chunking.',
    );
  }

  const provider = providerConfig(apiKey);
  const { mime } = mimeAndName(audioUri);

  const whisper = await whisperTranscribe(provider, apiKey, audioUri, mime);

  let transcript = whisper.text;
  if (!transcript) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  const spoken = resolveSpokenLanguage(whisper.language, uiLanguageCode);

  // Convert romanized / wrong-script text into the correct native script for detected language.
  transcript = await convertToNativeScript(provider, apiKey, transcript, spoken);

  const enrichment = await finalizeFromTranscript(
    provider,
    apiKey,
    transcript,
    spoken,
    onStage,
  );
  return {
    ...enrichment,
    detectedLanguage: spoken.code,
  };
}

/**
 * Ensures transcript uses the correct writing system for the detected language.
 * Example: "mala ek idea aala" → "मला एक आयडिया आला"
 */
async function convertToNativeScript(
  provider: ReturnType<typeof providerConfig>,
  apiKey: string,
  rawTranscript: string,
  targetLang: SpokenLanguage,
): Promise<string> {
  if (targetLang.script === 'latin') {
    return rawTranscript;
  }

  if (targetLang.script === 'devanagari' && hasDevanagari(rawTranscript)) {
    return rawTranscript;
  }
  if (targetLang.script === 'arabic' && /[\u0600-\u06FF]/.test(rawTranscript)) {
    return rawTranscript;
  }
  if (targetLang.script === 'cjk' && /[\u4e00-\u9fff]/.test(rawTranscript)) {
    return rawTranscript;
  }
  if (
    targetLang.script === 'japanese' &&
    /[\u3040-\u30ff\u4e00-\u9fff]/.test(rawTranscript)
  ) {
    return rawTranscript;
  }

  const scriptLabel =
    targetLang.script === 'devanagari'
      ? 'Devanagari (देवनागरी)'
      : targetLang.script === 'arabic'
        ? 'Arabic script'
        : targetLang.script === 'cjk'
          ? 'Chinese characters'
          : 'Japanese script (Kanji/Hiragana/Katakana)';

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.chatModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You convert speech transcripts into proper ${targetLang.name} writing.
Target language: ${targetLang.name} (${targetLang.nativeName}).
Target script: ${scriptLabel}.
Rules:
- Output ONLY the converted transcript in ${targetLang.name}.
- If input is romanized (English letters), convert to ${scriptLabel}.
- Keep meaning the same. Do not summarize. Do not translate to English.
- Keep English product names as English if spoken that way.
Return JSON: { "transcript": string }`,
          },
          {
            role: 'user',
            content: rawTranscript,
          },
        ],
      }),
    });

    if (!res.ok) return rawTranscript;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return rawTranscript;
    const parsed = JSON.parse(content) as { transcript?: string };
    const converted = cleanTranscript(parsed.transcript ?? '');
    return converted || rawTranscript;
  } catch {
    return rawTranscript;
  }
}

async function finalizeFromTranscript(
  provider: ReturnType<typeof providerConfig>,
  apiKey: string,
  transcript: string,
  targetLang: SpokenLanguage,
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void,
): Promise<AiEnrichment> {
  if (!transcript) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  onStage?.('extracting');
  onStage?.('summarizing');

  const chatRes = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
Language: ${targetLang.name} (${targetLang.nativeName}).
The transcript below is already in the correct script — copy it into "transcript" unchanged.
Write title, summary, and aiStory in ${targetLang.name} using the same script.
Keep category in English from: Movies, Songs, Books, Business, Scripts, Design, Music.
Title: max 8 words. Summary: 1-2 sentences from the transcript only.
Return JSON: { "transcript": string, "title": string, "category": string, "summary": string, "aiStory": string }`,
        },
        {
          role: 'user',
          content: `Transcript:\n${transcript}`,
        },
      ],
    }),
  });

  if (!chatRes.ok) {
    return {
      transcript,
      title: titleFromTranscript(transcript),
      category: guessCategory(transcript),
      summary: summaryFromTranscript(transcript),
      aiStory: summaryFromTranscript(transcript),
      detectedLanguage: targetLang.code,
    };
  }

  const chatJson = (await chatRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = chatJson.choices?.[0]?.message?.content;
  let parsed: Partial<AiEnrichment> = {};
  try {
    parsed = content ? (JSON.parse(content) as Partial<AiEnrichment>) : {};
  } catch {
    parsed = {};
  }

  const llmTranscript = cleanTranscript(parsed.transcript ?? '');
  const finalTranscript =
    (targetLang.script === 'devanagari'
      ? (hasDevanagari(llmTranscript) && llmTranscript) ||
        (hasDevanagari(transcript) && transcript) ||
        llmTranscript ||
        transcript
      : llmTranscript || transcript) || transcript;

  return {
    transcript: finalTranscript,
    title: parsed.title || titleFromTranscript(finalTranscript),
    category: parsed.category || guessCategory(finalTranscript),
    summary: parsed.summary || summaryFromTranscript(finalTranscript),
    aiStory: parsed.aiStory || parsed.summary || summaryFromTranscript(finalTranscript),
    detectedLanguage: targetLang.code,
  };
}

function cleanTranscript(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
