/** Normalize whitespace for stable transcript comparison. */
export function normalizeTranscriptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export type TranscriptBuffer = {
  finals: string[];
  interim: string;
};

/**
 * Merge a partial or final speech-recognition segment into the session buffer.
 * Preserves earlier finals when the engine restarts after a natural pause.
 */
export function mergeTranscriptSegment(
  buffer: TranscriptBuffer,
  incoming: string,
  asFinal: boolean,
): TranscriptBuffer {
  const text = normalizeTranscriptText(incoming);
  if (!text) {
    return buffer;
  }

  const committed = normalizeTranscriptText(buffer.finals.join(' '));

  if (!asFinal) {
    const interim =
      committed && text.startsWith(committed)
        ? text.slice(committed.length).trim()
        : text;
    return { finals: [...buffer.finals], interim };
  }

  const pendingInterim = normalizeTranscriptText(buffer.interim);
  const finals = [...buffer.finals];
  let interim = '';

  if (!committed) {
    if (pendingInterim) {
      if (pendingInterim.startsWith(text) && pendingInterim.length > text.length) {
        finals.splice(0, finals.length, pendingInterim);
      } else if (text.startsWith(pendingInterim) && text.length >= pendingInterim.length) {
        finals.splice(0, finals.length, text);
      } else if (pendingInterim !== text) {
        finals.splice(0, finals.length, pendingInterim, text);
      } else {
        finals.splice(0, finals.length, text);
      }
    } else {
      finals.splice(0, finals.length, text);
    }
  } else if (text.startsWith(committed)) {
    const rest = text.slice(committed.length).trim();
    if (rest) finals.push(rest);
  } else if (committed.endsWith(text) || text === committed) {
    // duplicate final from the engine — ignore
  } else if (!finals.includes(text)) {
    finals.push(text);
  }

  return { finals, interim };
}

/** Flush interim into finals when a recognition session ends mid-phrase. */
export function flushInterimToFinals(buffer: TranscriptBuffer): TranscriptBuffer {
  const pending = normalizeTranscriptText(buffer.interim);
  if (!pending) return buffer;
  return mergeTranscriptSegment(
    { finals: [...buffer.finals], interim: '' },
    pending,
    true,
  );
}
