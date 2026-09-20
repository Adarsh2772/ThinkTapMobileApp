const SARVAM_CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
const SARVAM_CHAT_MODEL =
  process.env.EXPO_PUBLIC_SARVAM_CHAT_MODEL?.trim() || 'sarvam-105b';

/** The dedicated Sarvam key, if configured. Shared by STT and chat. */
export function sarvamApiKey(): string | null {
  return process.env.EXPO_PUBLIC_SARVAM_API_KEY?.trim() || null;
}

/** True when Sarvam is configured and should handle STT + LLM work. */
export function isSarvamEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_USE_MOCK_AI === 'true') return false;
  return Boolean(sarvamApiKey());
}

export type SarvamChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Run one chat completion on Sarvam. Returns the assistant's text, or null on
 * any failure (no key, offline, timeout, bad response) so callers can fall
 * back gracefully rather than break the save.
 */
/**
 * Sarvam chat-completions helper.
 *
 * WHY this exists: Groq is fully removed, but Groq was doing real LLM work in
 * the app - category classification, and the polished title/summary. Those
 * jobs must not degrade to keyword/first-8-words heuristics (that keyword
 * fallback is exactly what put Tamil/Marathi thoughts wrongly in "Business").
 * Sarvam has an OpenAI-compatible chat endpoint with strong Indian-language
 * understanding, so every LLM job Groq did now runs here on Sarvam instead.
 *
 * Endpoint: POST https://api.sarvam.ai/v1/chat/completions
 * Auth:     api-subscription-key header (same key as speech-to-text)
 * Model:    sarvam-105b (best) - overridable via EXPO_PUBLIC_SARVAM_CHAT_MODEL
 *
 * NOTE on reasoning_effort: Sarvam chat has "thinking mode" ON by default,
 * which makes the model emit long reasoning before the answer - useless and
 * slow for short classification/summarisation. We pass reasoning_effort: null
 * to turn it off so replies are fast and to the point.
 */
export async function sarvamChat(
  messages: SarvamChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<string | null> {
  const apiKey = sarvamApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 15_000);

  try {
    const response = await fetch(SARVAM_CHAT_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: SARVAM_CHAT_MODEL,
        messages,
        temperature: opts?.temperature ?? 0,
        max_tokens: opts?.maxTokens ?? 512,
        // Turn OFF thinking mode - we want the answer, not the reasoning trace.
        reasoning_effort: null,
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask Sarvam for a strict JSON object and parse it. Returns null on any
 * failure or if the reply is not valid JSON. Used for the title/summary/
 * category enrichment which needs several fields at once.
 */
export async function sarvamChatJson<T>(
  messages: SarvamChatMessage[],
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<T | null> {
  const raw = await sarvamChat(messages, {
    temperature: 0,
    maxTokens: opts?.maxTokens ?? 1024,
    timeoutMs: opts?.timeoutMs ?? 20_000,
  });
  if (!raw) return null;

  // The model may wrap JSON in ```json fences or add stray prose; extract the
  // first {...} block and parse that.
  const match = raw.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
