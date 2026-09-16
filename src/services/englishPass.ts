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

const MODEL = 'llama-3.3-70b-versatile';
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
];

/** True when the text is clearly not yet English. */
export function needsEnglishPass(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (NON_LATIN.test(t)) return true;

  const words = t.toLowerCase().split(/\s+/);
  let hits = 0;
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (TRANSLITERATION_MARKERS.includes(clean)) {
      hits += 1;
      if (hits >= 2) return true;
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

  const system =
    'You translate personal voice notes into natural English. ' +
    'The input may be in Devanagari, or it may be Hindi or Marathi written in ' +
    'English letters — translate both into real English, never spell them out ' +
    'phonetically. ' +
    'Keep the meaning and the speaker\'s voice. Do not summarise, do not add ' +
    'anything, do not explain. ' +
    'If a passage is already English, leave it exactly as it is. ' +
    'Reply with the translated text only.';

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
