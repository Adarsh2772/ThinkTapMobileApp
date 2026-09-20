import { sarvamChat } from '@/src/services/sarvamChat';
import { CATEGORIES, CATEGORY_ALIASES, normalizeCategory } from '@/src/theme/tokens';

/**
 * Classifies a Thought into one of the app's categories using Sarvam's LLM.
 *
 * WHY an LLM and not keywords: the keyword list only worked for languages it
 * had entries for. A Marathi or Tamil recording matched nothing and fell
 * through to Business, so every regional thought ended up in the wrong tab -
 * the exact inaccuracy the client reported. An LLM reads meaning rather than
 * words, so "मला एक चित्रपट बनवायचा आहे" and "I want to make a film" both land
 * in Movies without maintaining a list, and it handles a thought about a film
 * that never uses the word "film".
 *
 * WHY Sarvam and not Groq: Groq is fully removed from the app. Sarvam's chat
 * model has strong Indian-language understanding, so it does this job at least
 * as well, on the same key already used for transcription - no second account.
 *
 * Returns a category, or null when classification could not be performed. Null
 * means "use the keyword fallback" (never "uncategorised"), so a network
 * failure downgrades the result rather than breaking the save.
 */
export async function categorizeWithLlm(transcript: string): Promise<string | null> {
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (text.length < 10) return null;

  /**
   * WHY the transcript is truncated: the opening sentences carry the subject,
   * and a long recording would otherwise spend tokens on detail that does not
   * change the answer.
   */
  const excerpt = text.slice(0, 1200);

  const system =
    'You categorise short personal voice notes. ' +
    `Reply with exactly one word from this list and nothing else: ${CATEGORIES.filter((c) => c !== 'All').join(', ')}. ` +
    'The note may be in any language - English, Hindi, Tamil, Marathi or another. ' +
    'Judge what the note is about, not which words it uses. ' +
    'If nothing fits clearly, reply Business.';

  const raw = await sarvamChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: excerpt },
    ],
    { temperature: 0, maxTokens: 8, timeoutMs: 12_000 },
  );

  if (!raw) return null;

  /**
   * WHY the reply is matched rather than trusted: a model can answer "Movies."
   * or "Category: Movies" despite the instruction. Matching against the known
   * list means an unexpected shape falls back instead of writing a category
   * that does not exist.
   *
   * WHY aliases are checked too: the prompt asks for the plural label
   * ("Movies", "Songs", "Scripts") but a model routinely answers with the
   * singular ("Movie", "Song", "Script"). Checking CATEGORIES alone missed
   * those - "song".includes("songs") is false - and silently fell back to the
   * keyword guess, landing song/movie/script notes back in Business.
   */
  const lower = raw.toLowerCase();
  const exact = CATEGORIES.find((c) => c !== 'All' && lower.includes(c.toLowerCase()));
  if (exact) return normalizeCategory(exact);

  const aliasKey = Object.keys(CATEGORY_ALIASES).find((alias) => lower.includes(alias));
  if (aliasKey) return CATEGORY_ALIASES[aliasKey];

  return null;
}
