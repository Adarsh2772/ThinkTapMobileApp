import { useAiConfigStore } from '@/src/store/aiConfigStore';

/**
 * Turns a partially-translated transcript into proper English.
 *
 * WHY this is needed on top of Whisper's translate endpoint: when Whisper is
 * unsure it *transliterates* rather than translates. "माझं जेवण तयार आहे"
 * comes back as "Majha jevan tayar ahe" — Marathi words spelled with English
 * letters, which is not English and is useless for search. Sometimes it leaves
 * the Devanagari in place entirely.
 *
 * A second pass over the text fixes both. It is text-to-text, so it is fast and
 * cheap compared with the audio call that produced it.
 *
 * Runs on Groq with the key already configured for transcription — no new
 * account, no cost beyond the same free tier.
 *
 * Failure returns the original text unchanged. A rough transcript is far better
 * than none, so this can never block a thought from being saved.
 */

/**
 * WHY not llama-3.3-70b-versatile: Groq decommissioned it on 16 August 2026.
 * Requests using it return 400, and because both of these features fail
 * silently by design, the app quietly fell back to keyword matching with no
 * sign anything was wrong.
 *
 * openai/gpt-oss-120b is Groq's recommended replacement. Overridable so the
 * next deprecation is a config change rather than a release.
 */
const MODEL = process.env.EXPO_PUBLIC_LLM_MODEL?.trim() || 'openai/gpt-oss-120b';
const TIMEOUT_MS = 15_000;

function baseUrlFor(apiKey: string): string {
  return apiKey.startsWith('gsk_')
    ? 'https://api.groq.com/openai/v1'
    : 'https://api.openai.com/v1';
}

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
 * True when the text needs translating.
 *
 * WHY a single marker is now enough: the transcript arrives in the language
 * spoken, so most non-English text is plainly non-English and caught by script.
 * The marker list catches the remaining case - Marathi or Hindi that Whisper
 * wrote in English letters, like "Ashi Banwa Banwi", where the script test
 * sees nothing wrong.
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
 */
export async function toEnglish(text: string): Promise<string> {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) return text;
  if (!needsEnglishPass(source)) return text;

  const apiKey = useAiConfigStore.getState().getApiKey();
  if (!apiKey) return text;

  /**
   * WHY the prompt is this specific: a general "translate this" instruction
   * produced transliteration on song titles and proper nouns - "Ashi Banwa
   * Banwi" came back unchanged because the model treated it as a name. Naming
   * the failure mode explicitly is what stops it.
   */
  const system = [
    'You translate personal voice notes into natural English.',
    '',
    'The input may be:',
    '- Devanagari or another Indic script',
    '- Hindi or Marathi written in English letters (transliteration)',
    '- English already',
    '- A mixture of these',
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
    '',
    'Reply with the translated text and nothing else.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrlFor(apiKey)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        // Deterministic: the same recording should always read the same way.
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: source },
        ],
      }),
    });

    if (!response.ok) return text;

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const out = json.choices?.[0]?.message?.content?.trim() ?? '';
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
      return stripped.length > 0 ? stripped : text;
    }

    return out;
  } catch {
    // Offline, timed out, or rate limited - keep what Whisper gave us.
    return text;
  } finally {
    clearTimeout(timer);
  }
}
