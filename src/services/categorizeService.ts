import { useAiConfigStore } from '@/src/store/aiConfigStore';
import { CATEGORIES, CATEGORY_ALIASES, normalizeCategory } from '@/src/theme/tokens';

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
     *
     * WHY aliases are checked too, not just CATEGORIES: the prompt asks for
     * the exact plural label ("Movies", "Songs", "Scripts"), but a model
     * routinely answers with the natural singular ("Movie", "Song", "Script")
     * despite that instruction. Checking CATEGORIES alone missed those
     * replies entirely - "song".includes("songs") is false - and silently
     * fell back to the keyword guess, which is the exact inaccuracy this LLM
     * call exists to fix. This was landing song/movie/script notes back in
     * Business.
     */
    const lower = raw.toLowerCase();
    const exact = CATEGORIES.find((c) => c !== 'All' && lower.includes(c.toLowerCase()));
    if (exact) return normalizeCategory(exact);

    const aliasKey = Object.keys(CATEGORY_ALIASES).find((alias) => lower.includes(alias));
    if (aliasKey) return CATEGORY_ALIASES[aliasKey];

    return null;
  } catch {
    // Offline, timed out, or rate limited - the caller falls back to keywords.
    return null;
  } finally {
    clearTimeout(timer);
  }
}