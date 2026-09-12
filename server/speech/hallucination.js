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

const SUPPORTED_STT_LANGS = new Set([
  'as',
  'assamese',
  'bn',
  'bengali',
  'en',
  'english',
  'gu',
  'gujarati',
  'hi',
  'hindi',
  'kn',
  'kannada',
  'ml',
  'malayalam',
  'mr',
  'marathi',
  'ne',
  'nepali',
  'or',
  'odia',
  'pa',
  'punjabi',
  'panjabi',
  'sa',
  'sanskrit',
  'sd',
  'sindhi',
  'ta',
  'tamil',
  'te',
  'telugu',
  'ur',
  'urdu',
  'fr',
  'french',
  'es',
  'spanish',
  'de',
  'german',
  'pt',
  'portuguese',
  'ar',
  'arabic',
  'zh',
  'chinese',
  'ja',
  'japanese',
]);

const CANNED = [
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

function foldHallucinationText(value) {
  return String(value || '')
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

function looksLikeWhisperPromptEcho(text) {
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

function cleanTranscript(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

/**
 * Whisper invents Korean / Punjabi / Norwegian / canned phrases on silence
 * and noise. Those must not become the saved transcript or language.
 */
export function looksLikeWhisperHallucination(text, language) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return true;

  const letters = t.replace(/[\s\d.,!?'"“”‘’\-—[\]()]/g, '');
  if (!letters) return true;
  if (t.length >= 8 && letters.length / t.length < 0.15) return true;

  const hangul = (t.match(/[\uAC00-\uD7A3]/g) ?? []).length;
  if (hangul / Math.max(letters.length, 1) >= 0.35) return true;

  const lang = String(language || '')
    .trim()
    .toLowerCase();
  const langIso = lang.split(/[-_]/)[0] || lang;
  if (HALLUCINATION_LANGS.has(lang) || HALLUCINATION_LANGS.has(langIso)) return true;
  if (lang && !SUPPORTED_STT_LANGS.has(lang) && !SUPPORTED_STT_LANGS.has(langIso)) return true;

  const gurmukhi = (t.match(/[\u0A00-\u0A7F]/g) ?? []).length;
  if ((langIso === 'pa' || lang === 'panjabi' || lang === 'punjabi') && gurmukhi === 0) {
    return true;
  }

  const lower = t.toLowerCase();
  if (CANNED.some((p) => lower.includes(p))) return true;
  if (looksLikeWhisperPromptEcho(t)) return true;

  return false;
}

export function transcriptFromWhisperSegments(fullText, language, segments = []) {
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
