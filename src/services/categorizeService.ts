import { useAiConfigStore } from '@/src/store/aiConfigStore';
import { CATEGORIES, normalizeCategory } from '@/src/theme/tokens';

/**
 * Classifies a Thought into one of the app's categories using an LLM.
 *
 * WHY this replaces keyword matching: the keyword list only worked for
 * languages it had entries for. A Marathi recording matched nothing and fell
 * through to Business, so every regional thought ended up in the wrong tab.
 * Adding keywords per language does not scale - there are twelve locales in the
 * picker and the vocabulary is endless.
 *
 * An LLM reads meaning rather than words, so "मला एक चित्रपट बनवायचा आहे" and
 * "I want to make a film" both land in Movies without anyone maintaining a
 * list. It also handles the case keywords cannot: a thought about a film that
 * never uses the word "film".
 *
 * Runs on Groq with the key already configured for transcription - no new
 * account, no extra cost beyond the same free tier.
 *
 * Falls back to keyword matching whenever this is unavailable, so a network
 * failure downgrades the result rather than breaking the save.
 */

const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 12_000;

function baseUrlFor(apiKey: string): string {
  // Mirrors the transcription provider selection.
  return apiKey.startsWith('gsk_')
    ? 'https://api.groq.com/openai/v1'
    : 'https://api.openai.com/v1';
}

/**
 * Returns a category, or null when classification could not be performed.
 * Null means "use the keyword fallback" - never "uncategorised".
 */
export async function categorizeWithLlm(
  transcript: string,
): Promise<string | null> {
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (text.length < 10) return null;

  const apiKey = useAiConfigStore.getState().getApiKey();
  if (!apiKey) return null;

  /**
   * WHY the transcript is truncated: the opening sentences carry the subject,
   * and a long recording would otherwise spend tokens on detail that does not
   * change the answer.
   */
  const excerpt = text.slice(0, 1200);

  const system =
    'You categorise short personal voice notes. ' +
    `Reply with exactly one word from this list and nothing else: ${CATEGORIES.filter((c) => c !== 'All').join(', ')}. ` +
    'The note may be in any language - English, Hindi, Marathi or another. ' +
    'Judge what the note is about, not which words it uses. ' +
    'If nothing fits clearly, reply Business.';

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
        // Deterministic: the same note should always land in the same tab.
        temperature: 0,
        max_tokens: 8,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: excerpt },
        ],
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) return null;

    /**
     * WHY the reply is matched rather than trusted: a model can answer
     * "Movies." or "Category: Movies" despite the instruction. Matching against
     * the known list means an unexpected shape falls back instead of writing a
     * category that does not exist.
     */
    const match = CATEGORIES.find(
      (c) => c !== 'All' && raw.toLowerCase().includes(c.toLowerCase()),
    );
    if (!match) return null;

    return normalizeCategory(match);
  } catch {
    // Offline, timed out, or rate limited - the caller falls back to keywords.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
