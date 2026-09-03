import { File, UploadType } from 'expo-file-system';
import { getInfoAsync } from 'expo-file-system/legacy';

import { hasDevanagari } from '@/src/features/wakeWord/phrases';
import { normalizeFileUri } from '@/src/services/audioStorage';
import {
  applyCodeMixIfNeeded,
  hasIndicScript,
  looksRomanizedIndic,
  resolveSpokenLanguage,
  type AppLanguageCode,
  type SpokenLanguage,
} from '@/src/i18n/languages';
import { useAiConfigStore } from '@/src/store/aiConfigStore';
import { normalizeCategory } from '@/src/theme/tokens';
import type { AiEnrichment } from '@/src/types';

export type EnrichmentResult = AiEnrichment & {
  source: 'live' | 'demo' | 'device';
};

/** Max upload size for cloud STT (Whisper / gpt-4o-transcribe limit is ~25 MB). */
export const MAX_STT_UPLOAD_BYTES = 25 * 1024 * 1024;

const CATEGORY_HINTS: { category: string; keywords: string[] }[] = [
  {
    category: 'Movies',
    keywords: [
      'movie',
      'movies',
      'film',
      'films',
      'cinema',
      'hollywood',
      'bollywood',
      'actor',
      'actress',
      'director',
      'trailer',
      'netflix',
      'sequel',
      'plot',
      'watching',
      'फिल्म',
      'मूवी',
      'चित्रपट',
    ],
  },
  {
    category: 'Songs',
    keywords: [
      'song',
      'songs',
      'lyrics',
      'verse',
      'chorus',
      'rap',
      'singer',
      'karaoke',
      'गाना',
      'गीत',
    ],
  },
  {
    category: 'Music',
    keywords: ['music', 'beat', 'melody', 'drum', 'bass', 'album', 'instrument', 'संगीत'],
  },
  {
    category: 'Books',
    keywords: ['book', 'books', 'novel', 'chapter', 'author', 'reading', 'किताब', 'पुस्तक'],
  },
  {
    category: 'Scripts',
    keywords: ['dialogue', 'screenplay', 'monologue', 'script', 'screen play'],
  },
  {
    category: 'Design',
    keywords: ['design', 'poster', 'ui', 'brand', 'visual', 'layout', 'figma'],
  },
  {
    category: 'Business',
    keywords: [
      'business',
      'startup',
      'customer',
      'revenue',
      'meeting',
      'office',
      'client',
      'sales',
      'investor',
    ],
  },
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
  let best = 'Business';
  let bestScore = 0;
  for (const hint of CATEGORY_HINTS) {
    const score = hint.keywords.reduce((n, k) => n + (lower.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = hint.category;
    }
  }
  return normalizeCategory(bestScore > 0 ? best : 'Business');
}

/**
 * Whisper often invents Korean / “thanks for watching” on silence or noise.
 * Those must not become the saved transcript or detected language.
 */
export function looksLikeWhisperHallucination(
  text: string,
  language?: string | null,
): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return true;

  const letters = t.replace(/[\s\d.,!?'"“”‘’\-—]/g, '');
  if (!letters) return true;

  const hangul = (t.match(/[\uAC00-\uD7A3]/g) ?? []).length;
  if (hangul / Math.max(letters.length, 1) >= 0.35) return true;

  const lang = (language ?? '').toLowerCase();
  if (lang === 'ko' || lang === 'korean' || lang === 'nn' || lang === 'no') return true;

  const lower = t.toLowerCase();
  const canned = [
    'thank you for watching',
    'thanks for watching',
    'thanks for listening',
    'please subscribe',
    'subscribe to',
    'mbc news',
    '시청해 주셔서',
    '구독',
  ];
  if (canned.some((p) => lower.includes(p))) return true;

  return false;
}

export function emptySpeechEnrichment(): EnrichmentResult {
  return {
    transcript: '',
    title: 'Voice note',
    category: 'Business',
    summary: 'Your recording was saved. No speech was detected in this take.',
    aiStory: null,
    detectedLanguage: '',
    source: 'demo',
  };
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

export function isCloudSttAvailable(): boolean {
  if (process.env.EXPO_PUBLIC_USE_MOCK_AI === 'true') return false;
  if (backendBaseUrl()) return true;
  return Boolean(useAiConfigStore.getState().getApiKey());
}

export function mimeAndName(uri: string): { mime: string; name: string } {
  const lower = uri.toLowerCase();
  if (lower.includes('.wav')) return { mime: 'audio/wav', name: 'idea.wav' };
  if (lower.includes('.mp3')) return { mime: 'audio/mpeg', name: 'idea.mp3' };
  if (lower.includes('.webm')) return { mime: 'audio/webm', name: 'idea.webm' };
  if (lower.includes('.3gp')) return { mime: 'audio/3gpp', name: 'idea.3gp' };
  return { mime: 'audio/mp4', name: 'idea.m4a' };
}

export function backendBaseUrl(): string | null {
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

/**
 * Whisper treats `prompt` as previous transcript text, not a system instruction.
 * English instructions bias the model to English. Seed with native-script speech.
 */
export function whisperPromptFor(_languageName: string | 'auto'): string {
  return 'आज मौसम अच्छा है। आज मी ऑफिसला जाणार आहे. कल मुझे meeting के लिए जाना है।';
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
  if (/Unsupported FormData/i.test(msg)) {
    return new Error('Could not send the recording for transcription. The file is still saved.');
  }
  if (
    /FileSystemUploadTask|Unable to resolve host|No address associated|UnknownHostException|ENOTFOUND|getaddrinfo|network request failed|Failed to fetch|fetch failed|ECONNREFUSED|timed out|timeout|network/i.test(
      msg,
    )
  ) {
    return new Error('Could not reach the transcription service. Check internet and try again.');
  }
  if (/25\s*MB|file too large|payload too large|413/i.test(msg)) {
    return new Error(
      'Recording is too long for transcription (max ~25 MB). Record a shorter clip or enable server-side chunking.',
    );
  }
  if (/No speech detected/i.test(msg)) {
    return error;
  }
  if (/503|not configured|provider unavailable|BharatGen/i.test(msg)) {
    return new Error('Speech-to-text provider is unavailable. Check the server configuration.');
  }
  if (/invalid transcription response|invalid API response/i.test(msg)) {
    return new Error('The transcription service returned an invalid response. Try again.');
  }
  return error;
}

/**
 * Native multipart upload via expo-file-system. Avoids expo/fetch FormData,
 * which rejects Expo File parts as "Unsupported FormDataPart implementation".
 */
export async function uploadAudioMultipart(input: {
  url: string;
  audioUri: string;
  mime: string;
  fileName: string;
  fieldName?: string;
  fields: Record<string, string>;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  const uri = normalizeFileUri(input.audioUri);
  let file: File;
  try {
    file = new File(uri);
  } catch {
    file = new File(uri.replace(/^file:\/\//, ''));
  }
  if (!file.exists) {
    throw new Error('Recording file not found on device');
  }

  try {
    const result = await file.upload(input.url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: input.fieldName ?? 'file',
      mimeType: input.mime,
      headers: input.headers,
      parameters: input.fields,
    });
    return { status: result.status, body: result.body };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Audio upload failed (network)');
  }
}

async function whisperTranscribe(
  provider: ReturnType<typeof providerConfig>,
  apiKey: string,
  audioUri: string,
  mime: string,
): Promise<{ text: string; language?: string }> {
  const { name: fileName } = mimeAndName(audioUri);
  // Omit `language` so the model auto-detects the spoken language.
  const uploadResult = await uploadAudioMultipart({
    url: `${provider.baseUrl}/audio/transcriptions`,
    audioUri,
    mime,
    fileName,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    fields: {
      model: provider.whisperModel,
      temperature: '0',
      prompt: whisperPromptFor('auto'),
      response_format: provider.responseFormat,
    },
  });

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
    const json = JSON.parse(uploadResult.body) as {
      text?: string;
      language?: string;
      segments?: Array<{ no_speech_prob?: number; text?: string }>;
    };
    const text = cleanTranscript(json.text ?? '');
    const language = json.language;
    const segments = json.segments ?? [];
    const noSpeech =
      segments.length > 0 &&
      segments.every((s) => (s.no_speech_prob ?? 0) >= 0.7 && !cleanTranscript(s.text ?? ''));
    if (noSpeech || looksLikeWhisperHallucination(text, language)) {
      return { text: '', language: undefined };
    }
    return { text, language };
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

  const { mime, name: fileName } = mimeAndName(audioUri);

  onStage?.('transcribing');
  const uploadResult = await uploadAudioMultipart({
    url: `${apiBase}/api/enrich`,
    audioUri,
    mime,
    fileName,
    fields: {},
  });

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
  if (!transcript || looksLikeWhisperHallucination(transcript, json.detectedLanguage)) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  return {
    transcript,
    title: preferSameScript(transcript, json.title) || titleFromTranscript(transcript),
    category: normalizeCategory(json.category || guessCategory(transcript)),
    summary: preferSameScript(transcript, json.summary) || summaryFromTranscript(transcript),
    aiStory:
      preferSameScript(transcript, json.aiStory) ||
      preferSameScript(transcript, json.summary) ||
      summaryFromTranscript(transcript),
    detectedLanguage:
      applyCodeMixIfNeeded(json.detectedLanguage || 'en', transcript) ||
      (json.detectedLanguage || 'en').toLowerCase(),
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

  let spoken = resolveSpokenLanguage(
    applyCodeMixIfNeeded(whisper.language, transcript) || whisper.language,
    uiLanguageCode,
  );

  // Restore native script for romanized Hindi/Marathi. Never translate to English.
  transcript = await convertToNativeScript(provider, apiKey, transcript, spoken);
  spoken = resolveSpokenLanguage(
    applyCodeMixIfNeeded(spoken.code, transcript) || spoken.code,
    uiLanguageCode,
  );

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
  if (hasIndicScript(rawTranscript)) {
    return rawTranscript;
  }

  const shouldRestore =
    looksRomanizedIndic(rawTranscript) ||
    (targetLang.script !== 'latin' && targetLang.script !== 'cjk' && targetLang.script !== 'japanese');
  if (!shouldRestore) {
    return rawTranscript;
  }

  const target =
    targetLang.script === 'latin' && looksRomanizedIndic(rawTranscript)
      ? resolveSpokenLanguage(applyCodeMixIfNeeded(undefined, rawTranscript) || 'hi')
      : targetLang;

  if (target.script === 'latin') {
    return rawTranscript;
  }

  if (target.script === 'devanagari' && hasDevanagari(rawTranscript)) {
    return rawTranscript;
  }
  if (target.script === 'arabic' && /[\u0600-\u06FF]/.test(rawTranscript)) {
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
    target.script === 'devanagari'
      ? 'Devanagari (देवनागरी)'
      : target.script === 'arabic'
        ? 'Arabic / Nastaliq script'
        : target.script === 'cjk'
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
            content: `You only change writing system. You never translate.
Target: ${target.name} (${target.nativeName}) in ${scriptLabel}.
Rules:
- If the input is romanized Hindi/Marathi (e.g. "aaj mi office la janar aahe"), rewrite it in ${scriptLabel}.
- Keep English words that were spoken in English (meeting, Zoom, office) as English.
- Do NOT translate Hindi/Marathi into English.
- Do NOT summarize. Keep the same words and order.
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
    if (!converted) return rawTranscript;
    if (looksRomanizedIndic(rawTranscript) && !hasIndicScript(converted)) {
      return rawTranscript;
    }
    return converted;
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
Copy the transcript into "transcript" EXACTLY. Do not translate. Do not transliterate.
Write title, summary, and aiStory in the SAME language and script as the transcript.
If the transcript mixes Hindi/Marathi with English, keep that mix.
Keep category in English from: Movies, Songs, Books, Business, Scripts, Design, Music.
Use Movies for films, cinema, actors, trailers, or watching a movie. Use Songs for lyrics or singing. Use Business only when the thought is clearly about work, a company, sales, or a startup. Do not default to Business when another category fits.
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

  const title = preferSameScript(transcript, parsed.title) || titleFromTranscript(transcript);
  const summary = preferSameScript(transcript, parsed.summary) || summaryFromTranscript(transcript);

  return {
    transcript,
    title,
    category: normalizeCategory(parsed.category || guessCategory(transcript)),
    summary,
    aiStory: preferSameScript(transcript, parsed.aiStory) || summary,
    detectedLanguage: targetLang.code,
  };
}

/** Drop LLM text that translated an Indic transcript into English. */
function preferSameScript(original: string, candidate: string | null | undefined): string {
  const text = cleanTranscript(candidate ?? '');
  if (!text) return '';
  if (hasIndicScript(original) && !hasIndicScript(text)) return '';
  return text;
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
