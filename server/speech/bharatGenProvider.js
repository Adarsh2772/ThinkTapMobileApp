function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Placeholder until BharatGen publishes an official hosted ASR API.
 * Shrutam-2 is currently self-host only (Hugging Face weights, no REST contract).
 * Do not invent URLs, auth, or request bodies.
 */
export async function transcribeWithBharatGen(_file, _options = {}) {
  const url = process.env.BHARATGEN_API_URL?.trim();
  const key = process.env.BHARATGEN_API_KEY?.trim();
  const model = process.env.BHARATGEN_SPEECH_MODEL?.trim();

  if (!url || !key) {
    throw httpError(
      'BharatGen is not configured. Set BHARATGEN_API_URL and BHARATGEN_API_KEY when official API access is available.',
      503,
    );
  }

  throw httpError(
    `BharatGen official request format is not published yet (model=${model || 'unset'}). Use SPEECH_PROVIDER=whisper until a documented API exists.`,
    503,
  );
}

export function bharatGenConfigured() {
  return Boolean(process.env.BHARATGEN_API_URL?.trim() && process.env.BHARATGEN_API_KEY?.trim());
}
