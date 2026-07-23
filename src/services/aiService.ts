import { File, UploadType } from 'expo-file-system';
import { getInfoAsync } from 'expo-file-system/legacy';

import { getLanguage, type AppLanguageCode } from '@/src/i18n/languages';
import { useAiConfigStore } from '@/src/store/aiConfigStore';
import type { AiEnrichment } from '@/src/types';

export type EnrichmentResult = AiEnrichment & {
  source: 'live' | 'demo';
};

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
      'Projeto criativo curto: primeiro o clima, estrutura simples e detalhes depois.',
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

function mimeAndName(uri: string): { mime: string; name: string } {
  const lower = uri.toLowerCase();
  if (lower.includes('.wav')) return { mime: 'audio/wav', name: 'idea.wav' };
  if (lower.includes('.mp3')) return { mime: 'audio/mpeg', name: 'idea.mp3' };
  if (lower.includes('.webm')) return { mime: 'audio/webm', name: 'idea.webm' };
  if (lower.includes('.3gp')) return { mime: 'audio/3gpp', name: 'idea.3gp' };
  return { mime: 'audio/mp4', name: 'idea.m4a' };
}

/**
 * Convert recorded audio → text (Whisper) + title/summary (LLM).
 * Supports Groq (gsk_…) free tier and OpenAI (sk-…).
 */
export async function enrichIdeaFromAudio(input: {
  audioUri: string;
  durationSec: number;
  languageCode: AppLanguageCode;
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void;
}): Promise<EnrichmentResult> {
  const apiKey = useAiConfigStore.getState().getApiKey();
  const language = getLanguage(input.languageCode);

  input.onStage?.('transcribing');

  if (apiKey) {
    try {
      const live = await enrichWithCloudStt(
        apiKey,
        input.audioUri,
        language.code,
        language.whisperCode,
        language.name,
        input.onStage,
      );
      return { ...live, source: 'live' };
    } catch (error) {
      console.warn('Live transcription failed', error);
      throw error instanceof Error
        ? error
        : new Error('Speech-to-text failed. Check your API key and network.');
    }
  }

  await delay(600);
  input.onStage?.('extracting');
  await delay(500);
  input.onStage?.('summarizing');
  await delay(400);

  const mock = MOCK_BY_LANGUAGE[input.languageCode] ?? MOCK_BY_LANGUAGE.en;
  return {
    transcript: mock.transcript,
    title: mock.title,
    category: mock.category,
    summary: mock.summary,
    aiStory: mock.summary,
    source: 'demo',
  };
}

function whisperPrompt(languageCode: AppLanguageCode, languageName: string): string {
  const base = `Transcribe clearly in ${languageName}. Preserve names, numbers, and punctuation.`;
  if (languageCode === 'hi' || languageCode === 'mr') {
    return `${base} The speaker may mix ${languageName} with English words (code-mixing). Keep English terms as spoken. Do not translate.`;
  }
  if (languageCode === 'en') {
    return `${base} Keep Indian names and product names accurate. Do not invent words.`;
  }
  return `${base} Do not translate into another language.`;
}

function providerConfig(apiKey: string) {
  const isGroq = apiKey.startsWith('gsk_');
  if (isGroq) {
    return {
      name: 'Groq' as const,
      baseUrl: 'https://api.groq.com/openai/v1',
      // Full large-v3 is more accurate than turbo (closer to Google quality).
      whisperModel: 'whisper-large-v3',
      chatModel: 'llama-3.3-70b-versatile',
    };
  }
  return {
    name: 'OpenAI' as const,
    baseUrl: 'https://api.openai.com/v1',
    whisperModel: 'whisper-1',
    chatModel: 'gpt-4o-mini',
  };
}

async function enrichWithCloudStt(
  apiKey: string,
  audioUri: string,
  languageCode: AppLanguageCode,
  whisperCode: string,
  languageName: string,
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void,
): Promise<AiEnrichment> {
  const info = await getInfoAsync(audioUri);
  if (!info.exists) {
    throw new Error('Recording file not found on device');
  }

  const provider = providerConfig(apiKey);
  const { mime } = mimeAndName(audioUri);

  // Use native multipart upload — RN FormData `{ uri, name, type }` throws
  // "Unsupported FormDataPart implementation" on modern Expo.
  const audioFile = new File(audioUri);
  const uploadResult = await audioFile.upload(`${provider.baseUrl}/audio/transcriptions`, {
    uploadType: UploadType.MULTIPART,
    httpMethod: 'POST',
    fieldName: 'file',
    mimeType: mime,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    parameters: {
      model: provider.whisperModel,
      language: whisperCode,
      temperature: '0',
      prompt: whisperPrompt(languageCode, languageName),
      response_format: 'json',
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(
      `${provider.name} Whisper error ${uploadResult.status}: ${uploadResult.body.slice(0, 180)}`,
    );
  }

  let sttJson: { text?: string } = {};
  try {
    sttJson = JSON.parse(uploadResult.body) as { text?: string };
  } catch {
    throw new Error(`${provider.name} returned an invalid transcription response`);
  }

  // Light cleanup only — do not rewrite meaning.
  const transcript = cleanTranscript(sttJson.text ?? '');
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
          content: `You organize voice ideas. Preferred language: ${languageName} (${languageCode}).
Write title, summary, and aiStory in ${languageName}.
Keep category in English from: Movies, Songs, Books, Business, Scripts, Design, Music.
Title: short (max 8 words). Summary: 1-2 sentences based ONLY on the transcript. Do not invent facts.
Return JSON: { "title": string, "category": string, "summary": string, "aiStory": string }`,
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

  return {
    transcript,
    title: parsed.title || titleFromTranscript(transcript),
    category: parsed.category || guessCategory(transcript),
    summary: parsed.summary || summaryFromTranscript(transcript),
    aiStory: parsed.aiStory || parsed.summary || summaryFromTranscript(transcript),
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
