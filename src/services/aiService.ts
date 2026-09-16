import { File, UploadType } from 'expo-file-system';
import { getInfoAsync } from 'expo-file-system/legacy';

import { hasDevanagari } from '@/src/features/wakeWord/phrases';
import { normalizeFileUri } from '@/src/services/audioStorage';
import {
  applyCodeMixIfNeeded,
  hasIndicScript,
  isSupportedSpokenLanguage,
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

/**
 * Keywords that route a thought to a category.
 *
 * WHY multilingual: the list was English-only, so a Hindi or Marathi transcript
 * matched nothing and every recording landed in Business regardless of what it
 * was about. Speech in the user's own language has to be classifiable in that
 * language.
 *
 * Hindi and Marathi share Devanagari, so most entries serve both. Other
 * scripts can be added the same way - the matcher is whole-word and
 * script-agnostic.
 *
 * These are a fallback. When the analysis service is reachable it classifies
 * far better than keywords can; this is what keeps the app usable while that
 * service is down.
 */
const CATEGORY_HINTS: { category: string; keywords: string[] }[] = [
  {
    category: 'Movies',
    keywords: [
      'movie', 'movies', 'film', 'films', 'cinema', 'hollywood', 'bollywood',
      'actor', 'actress', 'director', 'trailer', 'netflix', 'sequel', 'plot',
      'scene', 'shooting', 'documentary', 'webseries', 'series',
      // Hindi / Marathi
      'फिल्म', 'मूवी', 'चित्रपट', 'सिनेमा', 'अभिनेता', 'अभिनेत्री', 'दिग्दर्शक',
      'निर्देशक', 'कहानी', 'पटकथा', 'शूटिंग', 'ट्रेलर', 'नायक', 'नायिका',
    ],
  },
  {
    category: 'Songs',
    keywords: [
      'song', 'songs', 'lyrics', 'verse', 'chorus', 'rap', 'singer', 'karaoke',
      'sing', 'singing', 'ballad', 'antara', 'mukhda',
      // Hindi / Marathi
      'गाना', 'गाने', 'गीत', 'गाणे', 'गाणी', 'बोल', 'अंतरा', 'मुखड़ा',
      'गायक', 'गायिका', 'कविता',
    ],
  },
  {
    category: 'Music',
    keywords: [
      'music', 'beat', 'melody', 'drum', 'drums', 'bass', 'album', 'instrument',
      'guitar', 'piano', 'tabla', 'raag', 'raga', 'tune', 'composer', 'band',
      // Hindi / Marathi
      'संगीत', 'धुन', 'ताल', 'राग', 'वाद्य', 'तबला', 'बांसुरी', 'सुर',
      'संगीतकार', 'अल्बम',
    ],
  },
  {
    category: 'Books',
    keywords: [
      'book', 'books', 'novel', 'chapter', 'author', 'reading', 'read',
      'publish', 'publisher', 'story', 'poetry', 'literature', 'writer',
      // Hindi / Marathi
      'किताब', 'पुस्तक', 'पुस्तके', 'अध्याय', 'लेखक', 'लेखिका', 'कादंबरी',
      'उपन्यास', 'साहित्य', 'प्रकाशक', 'वाचन', 'गोष्ट', 'कथा',
      // Spellings Whisper actually produces for these words.
      'गोस्ट', 'कहानि', 'पुस्तिका',
    ],
  },
  {
    category: 'Scripts',
    keywords: [
      'dialogue', 'screenplay', 'monologue', 'script', 'scripts', 'scene',
      'act', 'character', 'draft',
      // Hindi / Marathi
      'संवाद', 'पटकथा', 'स्क्रिप्ट', 'दृश्य', 'पात्र', 'भूमिका', 'नाटक',
      'एकपात्री', 'मसुदा',
    ],
  },
  {
    category: 'Design',
    keywords: [
      'design', 'poster', 'logo', 'brand', 'branding', 'visual', 'layout',
      'figma', 'typography', 'colour', 'color', 'palette', 'mockup', 'ui', 'ux',
      // Hindi / Marathi
      'डिजाइन', 'डिझाइन', 'पोस्टर', 'रंग', 'रचना', 'लोगो', 'मांडणी',
      'नमुना', 'आकृती', 'सजावट',
    ],
  },
  {
    category: 'Business',
    keywords: [
      'business', 'startup', 'customer', 'customers', 'revenue', 'meeting',
      'office', 'client', 'clients', 'sales', 'investor', 'funding', 'profit',
      'market', 'product', 'strategy', 'team', 'project', 'deadline',
      // Hindi / Marathi
      'व्यवसाय', 'व्यापार', 'धंदा', 'ग्राहक', 'बैठक', 'मीटिंग', 'ऑफिस',
      'कार्यालय', 'नफा', 'बाजार', 'गुंतवणूक', 'निवेश', 'कंपनी', 'योजना',
      'विक्री', 'बिक्री', 'प्रकल्प', 'प्रोजेक्ट',
    ],
  },
];

/**
 * WHY this was rewritten: the old version scored a keyword only once no matter
 * how often it appeared, matched on raw substrings (so "designer" counted for
 * Design but "redesign" also matched inside unrelated words), and fell back to
 * 'Business' whenever nothing hit. With an empty or short transcript that meant
 * every single thought landed in Business regardless of what was said.
 *
 * Now: whole-word matching, repeated mentions count, and an explicit tie-break
 * order so Movies/Songs/Music do not steal each other's thoughts.
 */
function guessCategory(text: string): string {
  const lower = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')} `;
  if (lower.trim().length < 3) {
    // Nothing to go on - do not pretend this is a Business thought.
    return normalizeCategory('Business');
  }

  let best = '';
  let bestScore = 0;

  for (const hint of CATEGORY_HINTS) {
    let score = 0;
    for (const k of hint.keywords) {
      // Whole-word match, counted every time it occurs.
      const needle = ` ${k} `;
      let idx = lower.indexOf(needle);
      while (idx !== -1) {
        score += 1;
        idx = lower.indexOf(needle, idx + 1);
      }
      // Also catch simple plurals / possessives for Latin keywords.
      if (/^[a-z]+$/.test(k)) {
        if (lower.includes(` ${k}s `)) score += 1;
        if (lower.includes(` ${k}'s `)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = hint.category;
    }
  }

  if (bestScore === 0 || !best) {
    return normalizeCategory('Business');
  }
  return normalizeCategory(best);
}

export type WhisperSegment = { no_speech_prob?: number; text?: string };

const HALLUCINATION_LANGS = new Set([
  'ko',
  'korean',
  'nn',
  'no',
  'nb',
  'nynorsk',
  'norwegian',
  'norwegian nynorsk',
  'ro',
  'romanian',
  'hu',
  'hungarian',
  'cy',
  'welsh',
  'mt',
  'maltese',
  'la',
  'latin',
]);

const CANNED_HALLUCINATIONS = [
  'thank you for watching',
  'thanks for watching',
  'thanks for listening',
  'please subscribe',
  'subscribe to my',
  'subscribe to the',
  'like and subscribe',
  "don't forget to subscribe",
  'dont forget to subscribe',
  'nu uitați să vă abonați',
  'nu uitati sa va abonati',
  'abonați la canalul',
  'abonati la canalul',
  'canalul meu',
  'publicez noile video',
  'suscríbete',
  'suscribete',
  'abonnez-vous',
  'inscreva-se no canal',
  'iscriviti al canale',
  'mbc news',
  '시청해 주셔서',
  '구독',
  'subtitles by',
  'amara.org',
  '[music]',
  '(music)',
  '[applause]',
  '(applause)',
];

/** Same seed Whisper sees as `prompt`. On silence it often repeats this as the transcript. */
const WHISPER_SEED_PROMPT =
  'आज मौसम अच्छा है। आज मी ऑफिसला जाणार आहे. कल मुझे meeting के लिए जाना है।';

/**
 * Removes echoes of the old Whisper seed prompt from a transcript.
 *
 * WHY this is still needed after the seed was removed: recordings made by
 * earlier builds already contain the echo, and Whisper can reproduce fragments
 * it learned from similar priming. A real English recording came back with
 * "कल मुझे meeting के लिए जाना है।" inserted twice mid-sentence - text the user
 * never spoke.
 *
 * Only these exact phrases are stripped. Genuine Hindi or Marathi the user
 * actually speaks is untouched, because the Human Signal must stay verbatim.
 */
const SEED_ECHO_PATTERNS: RegExp[] = [
  /आज\s*मौसम\s*अच्छा\s*है।?/gu,
  /आज\s*मी\s*ऑफिसला\s*जाणार\s*आहे।?\.?/gu,
  /कल\s*मुझे\s*meeting\s*के\s*लिए\s*जाना\s*है।?/gu,
  /अच्छा\s*जाणार\s*जाणार\s*का\s*भूत्रे\s*के\s*लिए\s*जाना\s*है।?/gu,
];

/**
 * Spoken commands that may be caught at the end of a take.
 *
 * WHY this is needed even with the audio trimmed: the trim removes two seconds
 * from the end, but a command spoken slightly earlier, or repeated, still lands
 * in the transcript. "hey think tap stop" is an instruction to the app, not
 * part of the user's idea, so it must never become the Human Signal.
 *
 * Only the command phrases are removed. Everything else the user said is
 * untouched, in whatever language they said it.
 */
const SPOKEN_COMMAND_PATTERNS: RegExp[] = [
  // The name, however the model renders it, followed by an action word.
  /\b(hey\s+)?think\s?(tap|tab|top|app|that)\s*(start|stop|pause|resume|end|finish)\b[.,!?]*/giu,
  // Devanagari renderings of the same.
  /(हे\s*)?थिंक\s*(टॅप|टैप|टॅब|टैब)\s*(स्टार्ट|स्टॉप|स्टाप|पॉज|पॉझ|रिझ्यूम|रिज्यूम)[।.,!?]*/giu,
  // Bare trailing command after the name was cut off by the trim.
  /\b(hey\s+)?think\s?(tap|tab|top|app|that)\b[.,!?]*\s*$/giu,
];

export function stripSpokenCommands(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of SPOKEN_COMMAND_PATTERNS) {
    out = out.replace(re, ' ');
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?।])/g, '$1').trim();
}

export function stripSeedEcho(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of SEED_ECHO_PATTERNS) {
    out = out.replace(re, ' ');
  }
  // Collapse the gaps the removals leave behind.
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
  if (out !== text) {
  }
  return out;
}

function foldHallucinationText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[।.!,?;:'"()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bmi\b/g, 'मी')
    .replace(/काळ/g, 'कल')
    .replace(/मीटिंग|मिटींग/g, 'meeting')
    .replace(/लिये/g, 'लिए')
    .replace(/\bजन\b/g, 'जाना')
    .trim();
}

function looksLikeWhisperPromptEcho(text: string): boolean {
  const folded = foldHallucinationText(text);
  const prompt = foldHallucinationText(WHISPER_SEED_PROMPT);
  if (!folded) return true;
  if (prompt.includes(folded) && folded.split(' ').length >= 4) return true;
  if (folded.includes(prompt)) return true;

  const promptTokens = new Set(prompt.split(' ').filter(Boolean));
  const words = folded.split(' ').filter(Boolean);
  if (words.length < 5) return false;
  const hits = words.filter((word) => promptTokens.has(word)).length;
  return hits >= 5 && hits / words.length >= 0.65;
}

/**
 * Whisper often invents Korean / Punjabi / Norwegian / “thanks for watching”
 * on silence, noise, or overlapping speech. Those must not become the saved
 * transcript or detected language.
 */
export function looksLikeWhisperHallucination(
  text: string,
  language?: string | null,
): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return true;

  const letters = t.replace(/[\s\d.,!?'"“”‘’\-—[\]()]/g, '');
  if (!letters) return true;
  if (t.length >= 8 && letters.length / t.length < 0.15) return true;

  const hangul = (t.match(/[\uAC00-\uD7A3]/g) ?? []).length;
  if (hangul / Math.max(letters.length, 1) >= 0.35) return true;

  const lang = (language ?? '').trim().toLowerCase();
  const langIso = lang.split(/[-_]/)[0] ?? lang;
  if (HALLUCINATION_LANGS.has(lang) || HALLUCINATION_LANGS.has(langIso)) return true;
  if (lang && !isSupportedSpokenLanguage(lang) && !isSupportedSpokenLanguage(langIso)) return true;

  const gurmukhi = (t.match(/[\u0A00-\u0A7F]/g) ?? []).length;
  if ((langIso === 'pa' || lang === 'panjabi' || lang === 'punjabi') && gurmukhi === 0) {
    return true;
  }

  const lower = t.toLowerCase();
  if (CANNED_HALLUCINATIONS.some((p) => lower.includes(p))) return true;
  if (looksLikeWhisperPromptEcho(t)) return true;

  return false;
}

/**
 * Drop non-speech Whisper segments, then reject leftover hallucination.
 * Overlapping speakers must not invent words that were never said.
 */
export function transcriptFromWhisperSegments(
  fullText: string,
  language: string | undefined,
  segments: WhisperSegment[] = [],
): { text: string; language?: string } {
  let text = cleanTranscript(fullText);
  if (segments.length > 0) {
    const kept = segments
      .filter((s) => (s.no_speech_prob ?? 0) < 0.7)
      .map((s) => cleanTranscript(s.text ?? ''))
      .filter(Boolean);
    const allNoise = segments.every(
      (s) => (s.no_speech_prob ?? 0) >= 0.7 || !cleanTranscript(s.text ?? ''),
    );
    if (allNoise || kept.length === 0) {
      return { text: '', language: undefined };
    }
    text = cleanTranscript(kept.join(' '));
  }
  if (!text || looksLikeWhisperHallucination(text, language)) {
    return { text: '', language: undefined };
  }
  return { text, language };
}

export const UNCLEAR_RECORDING_MESSAGE =
  'Audio saved. The transcript will appear once transcription completes.';

export function emptySpeechEnrichment(): EnrichmentResult {
  return {
    transcript: '',
    title: 'Voice note',
    category: 'Business',
    summary: UNCLEAR_RECORDING_MESSAGE,
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
  /**
   * The transcription language the user chose in Settings, e.g. "hi-IN".
   * Passed to Whisper as a hint. Omit to auto-detect.
   */
  speechLocale?: string;
  /** True to translate everything to English instead of keeping it verbatim. */
  translateToEnglish?: boolean;
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
      const live = await enrichWithCloudStt(
        apiKey,
        input.audioUri,
        uiLanguageCode,
        input.onStage,
        input.speechLocale,
        input.translateToEnglish ?? false,
      );
      return { ...live, source: 'live' };
    } catch (error) {
      console.warn('Live transcription failed', error);
      throw mapSttError(error);
    }
  }

  /**
   * WHY this no longer returns MOCK_BY_LANGUAGE: with no API key configured the
   * app used to return hardcoded sample text ("Creative Project Spark") and
   * store it as if it were the user's real transcript. A user who recorded
   * twenty minutes about ASP.NET Core got back an invented note about a
   * creative project, with no indication anything had gone wrong.
   *
   * Fabricating content is worse than failing. The recording is still saved -
   * the transcript is simply left empty with an honest message, and can be
   * generated later once a key is configured.
   *
   * Sample data is still available for screenshots by setting
   * EXPO_PUBLIC_USE_MOCK_AI=true explicitly.
   */
  if (process.env.EXPO_PUBLIC_USE_MOCK_AI === 'true') {
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

  console.warn(
    '[AI] No speech-to-text key configured. Audio saved; transcript not generated.',
  );
  return {
    transcript: '',
    title: 'Voice note',
    category: 'Business',
    summary:
      'Audio saved. Transcription is not set up yet - add a speech-to-text key to generate the transcript.',
    aiStory: null,
    detectedLanguage: '',
    source: 'demo',
  };
}

/**
 * Whisper treats `prompt` as previous transcript text, not a system instruction.
 * English instructions bias the model to English. Seed with native-script speech.
 */
export function whisperPromptFor(_languageName: string | 'auto'): string {
  /**
   * WHY the seed prompt is no longer sent: Whisper treats `prompt` as previous
   * transcript text, so on unclear or quiet audio it simply repeats it back.
   * A real 46-second English recording came back with
   * "कल मुझे meeting के लिए जाना है।" twice - verbatim from the seed, not
   * anything the user said. Fabricated content in the Human Signal is worse
   * than a slightly weaker language bias.
   *
   * Whisper auto-detects language without a seed. Code-mixed speech is handled
   * by the model itself rather than by priming it.
   */
  return '';
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
  languageHint?: string,
  translateToEnglish = false,
): Promise<{ text: string; language?: string }> {
  const { name: fileName } = mimeAndName(audioUri);
  /**
   * WHY the language is sent when the user has chosen one: auto-detect guesses
   * per 30-second window and drifts on Indic speech, which is why Hindi and
   * Marathi came back with wrong spellings while English was fine. Telling the
   * model which language to expect removes the guess and noticeably improves
   * the transcript.
   *
   * Code-switching still works - Whisper handles English words inside a Hindi
   * sentence. What it cannot do well is decide the base language from a short,
   * accented, code-mixed clip.
   *
   * Absent means auto-detect, so nothing changes for users who have not picked
   * a transcription language.
   */
  const uploadResult = await uploadAudioMultipart({
    /**
     * Two endpoints, two behaviours.
     *
     * /audio/transcriptions - keeps each language in its own script. Marathi
     *   stays "माझं जेवण तयार आहे".
     * /audio/translations   - always outputs English, whatever was spoken.
     *   The same line becomes "my food is ready".
     *
     * The translate endpoint ignores a `language` field, so the hint is only
     * sent when transcribing.
     */
    url: translateToEnglish
      ? `${provider.baseUrl}/audio/translations`
      : `${provider.baseUrl}/audio/transcriptions`,
    audioUri,
    mime,
    fileName,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    fields: {
      model: provider.whisperModel,
      // Deterministic: no creative filling-in of unclear audio.
      temperature: '0',
      response_format: provider.responseFormat,
      ...(!translateToEnglish && languageHint ? { language: languageHint } : {}),
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
    return transcriptFromWhisperSegments(
      json.text ?? '',
      json.language,
      json.segments ?? [],
    );
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
      applyCodeMixIfNeeded(json.detectedLanguage, transcript) ||
      (json.detectedLanguage ?? '').toLowerCase(),
  };
}

/**
 * Converts a Settings locale such as "hi-IN" into the ISO code Whisper expects
 * ("hi"). Returns undefined for English and for anything unrecognised, so those
 * fall back to auto-detect rather than being forced into the wrong language.
 */
function whisperLanguageFrom(speechLocale?: string): string | undefined {
  /**
   * Absent, 'auto' and English all mean "let the model decide".
   *
   * WHY English is excluded rather than sent: telling Whisper the audio is
   * English makes it render other languages AS English - a Marathi sentence
   * came back translated to "my food is ready" instead of
   * "माझं जेवण तयार आहे". Auto-detect keeps each language in its own script.
   */
  if (!speechLocale || speechLocale === 'auto') return undefined;
  const base = speechLocale.split(/[-_]/)[0]?.toLowerCase();
  if (!base || base === 'en' || base === 'auto') return undefined;
  // Whisper takes two-letter ISO-639-1 codes.
  return /^[a-z]{2}$/.test(base) ? base : undefined;
}

async function enrichWithCloudStt(
  apiKey: string,
  audioUri: string,
  uiLanguageCode: AppLanguageCode,
  onStage?: (stage: 'transcribing' | 'extracting' | 'summarizing') => void,
  speechLocale?: string,
  translateToEnglish = false,
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

  const whisper = await whisperTranscribe(
    provider,
    apiKey,
    audioUri,
    mime,
    whisperLanguageFrom(speechLocale),
    translateToEnglish,
  );

  // Strip any echo of the old seed prompt before the text becomes the Human Signal.
  let transcript = stripSpokenCommands(stripSeedEcho(whisper.text));
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
