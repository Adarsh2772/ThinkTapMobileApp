const HALLUCINATION_LANGS = new Set([
  'ko',
  'korean',
  'nn',
  'no',
  'nb',
  'nynorsk',
  'norwegian',
  'norwegian nynorsk',
]);

const CANNED = [
  'thank you for watching',
  'thanks for watching',
  'thanks for listening',
  'please subscribe',
  'subscribe to',
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

  const gurmukhi = (t.match(/[\u0A00-\u0A7F]/g) ?? []).length;
  if ((langIso === 'pa' || lang === 'panjabi' || lang === 'punjabi') && gurmukhi === 0) {
    return true;
  }

  const lower = t.toLowerCase();
  if (CANNED.some((p) => lower.includes(p))) return true;

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
