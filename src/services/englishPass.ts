import { sarvamChat } from '@/src/services/sarvamChat';

/**
 * Turns a partially-translated transcript into proper English.
 *
 * WHY this is (rarely) needed: in the normal Sarvam path this is a no-op -
 * Sarvam's "translate" mode already returns English, so the caller reports
 * detectedLanguage as 'en' and this function returns immediately. It only does
 * real work on an edge path where non-English text arrives (e.g. a device
 * on-device transcript), and it routes that through Sarvam's chat model.
 *
 * Failure returns the original text unchanged. A rough transcript is far better
 * than none, so this can never block a thought from being saved.
 */

const TIMEOUT_MS = 30_000;

/** Non-Latin script that should not survive an English translation. */
const NON_LATIN = /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0600-\u06FF]/;

/**
 * Words that betray transliteration rather than translation.
 *
 * WHY a word list: transliterated Marathi and Hindi look like English
 * characters, so script detection alone misses them. These are common enough
 * that a couple of hits is strong evidence the text was never translated.
 */
const TRANSLITERATION_MARKERS = [
  'aahe', 'ahe', 'nahi', 'nahin', 'kara', 'karto', 'karte', 'zala', 'zale',
  'mala', 'tula', 'tyala', 'amhi', 'tumhi', 'maza', 'majha', 'tumcha',
  'hain', 'kya', 'kaise', 'karna', 'karne', 'liye', 'raha', 'rahi', 'rahe',
  'tayar', 'jevan', 'chaan', 'khup', 'ekda', 'gosht', 'mhanje', 'ani',
  // Seen in real transcripts from the app.
  'banwa', 'banwi', 'banavi', 'asihi', 'ashi', 'aahet', 'hoti', 'hota',
  'sangto', 'sangte', 'pahije', 'kelay', 'zhala', 'tyacha', 'tyachi',
  'mazha', 'majhi', 'aapla', 'aaple', 'yeto', 'yete', 'disto', 'diste',
];

/**
 * True when the text needs translating, based on script/word heuristics only.
 *
 * WHY this is kept as a fallback and not the primary signal any more: it only
 * catches Indic scripts plus a Hindi/Marathi transliteration word list. A
 * transcript in Tamil, Telugu, Gujarati, Kannada, or any other language whose
 * words are not on that list - and French, Spanish, German, Portuguese,
 * Chinese, Japanese, all of which the app also supports - would never trip
 * this check, so `toEnglish` skipped them and they stayed in the local
 * language. `toEnglish` now primarily trusts the language Whisper detected
 * (see the `spokenLanguageCode` parameter below) and only falls back to this
 * heuristic when no detected language is available.
 *
 * A false positive is cheap: the model is told to leave English untouched, so
 * running the pass on English text returns it unchanged.
 */
export function needsEnglishPass(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (NON_LATIN.test(t)) return true;

  const words = t.toLowerCase().split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length >= 3 && TRANSLITERATION_MARKERS.includes(clean)) {
      return true;
    }
  }
  return false;
}

/**
 * Translate anything non-English in the text, leaving genuine English alone.
 * Returns the original on any failure.
 *
 * @param spokenLanguageCode The language Whisper detected the audio as
 * (e.g. 'ta' for Tamil, 'te' for Telugu, 'fr' for French). This is the
 * authoritative signal: if it is set and is not English, we translate,
 * full stop - no script or word guessing needed, and it covers every
 * language the app supports, not just the ones with a keyword list.
 * When it is missing (older callers, device-transcript path with no
 * language info), we fall back to the script/word heuristic below so
 * behaviour degrades gracefully instead of silently skipping translation.
 */
export async function toEnglish(
  text: string,
  spokenLanguageCode?: string,
): Promise<string> {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) return text;

  const knownNonEnglish =
    typeof spokenLanguageCode === 'string' &&
    spokenLanguageCode.trim().length > 0 &&
    !spokenLanguageCode.toLowerCase().startsWith('en');

  const shouldTranslate =
    spokenLanguageCode !== undefined ? knownNonEnglish : needsEnglishPass(source);

  if (!shouldTranslate) return text;

  /**
   * WHY Sarvam and not Groq: Groq is removed from the app. In the normal
   * Sarvam path this function is a no-op anyway (Sarvam already returns
   * English, so detectedLanguage is 'en' and shouldTranslate is false). This
   * branch only runs in edge cases - e.g. a device-transcript path that came
   * in as non-English - and routes translation through Sarvam's chat model,
   * which is strong on Indian languages.
   */
  const system = [
    'You translate personal voice notes into natural English.',
    '',
    'The input may be:',
    '- Devanagari or another Indic script',
    '- Hindi or Marathi written in English letters (transliteration)',
    '- English already',
    '- A mixture of these',
    '- Song lyrics, which may repeat lines or verses - keep the repetition,',
    '  translate every line, do not shorten it into a summary',
    '',
    'Rules:',
    '1. Translate meaning into English. Never spell words out phonetically.',
    '   "Ashi Banwa Banwi" is a Marathi phrase meaning roughly "such pretence"',
    '   - translate it, do not repeat it.',
    '2. Leave passages that are already English exactly as they are.',
    '3. Keep proper nouns as they are: people, places, film and song titles.',
    '4. Keep the speaker\'s voice and every point they made. Do not summarise,',
    '   do not add anything, do not explain what you did.',
    '5. If a phrase is genuinely untranslatable, give the closest English',
    '   meaning rather than the original words.',
    '6. Never add a note, comment, or remark about the transcript, its',
    '   quality, or whether it seems garbled or repetitive - translate',
    '   whatever text is there and stop. No parenthetical asides, no',
    '   "(Note: ...)", nothing after the translation itself.',
    '',
    'Reply with the translated text and nothing else.',
  ].join('\n');

  try {
    let out =
      (await sarvamChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: source },
        ],
        { temperature: 0, maxTokens: 4096, timeoutMs: TIMEOUT_MS },
      )) ?? '';
    out = out.trim();
    if (!out) return text;

    /**
     * WHY the result is sanity-checked: a model can answer with a preamble
     * ("Here is the translation:") or, on a very short input, refuse and
     * explain itself. Neither should replace the user's thought, so anything
     * that does not look like a translation is discarded.
     */
    if (out.length < source.length * 0.25) return text;
    if (/^(here is|here's|translation:|sure[,!])/i.test(out)) {
      const stripped = out.replace(/^[^:\n]*[:\n]\s*/, '').trim();
      out = stripped.length > 0 ? stripped : out;
    }

    /**
     * WHY this runs even with rule 6 in the prompt: instructions are not a
     * guarantee. A real reply came back with the translation followed by
     * "(Note: The original text appears to be nonsensical or garbled, so
     * the translation reflects the literal meaning as closely as possible.)"
     * appended - the model's own commentary, saved as if the user said it.
     * Strip a trailing parenthetical note rather than trust the prompt alone.
     */
    out = out.replace(/\s*\(note:[^)]*\)\s*$/i, '').trim();

    return out || text;
  } catch {
    // Offline, timed out, or rate limited - keep what we already had.
    return text;
  }
}
