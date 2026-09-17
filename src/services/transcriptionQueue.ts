import AsyncStorage from '@react-native-async-storage/async-storage';

import { isNetworkError } from '@/src/services/aiService';
import { recordingExists } from '@/src/services/audioStorage';
import { enrichPendingRecording } from '@/src/services/processRecording';
import { useIdeasStore } from '@/src/store/ideasStore';
import type { AppLanguageCode } from '@/src/i18n/languages';

/**
 * Retries transcription for takes that were saved without one.
 *
 * WHY this exists: the product rule is "save audio first, attach the transcript
 * when ready". The first half worked - a recording is written to disk before any
 * network call, so a thought can never be lost. The second half did not: if
 * transcription failed (airplane mode, no signal, Whisper down) the transcript
 * stayed empty forever. There was no path back.
 *
 * A failed take is now queued and retried the next time the app opens with a
 * working connection. The audio is already on the device, so the retry is just
 * the upload that did not happen the first time.
 *
 * Entries are dropped when: the transcript succeeds, the audio file no longer
 * exists, or the maximum attempts are exhausted - so the queue cannot grow
 * without bound.
 */

const QUEUE_KEY = '@thinktap/transcribe_queue';
const MAX_ATTEMPTS = 5;

/**
 * Real failures needed before the UI offers a manual retry.
 *
 * WHY not one: the first request after a connection returns often fails while
 * DNS and the socket are still settling. Marking that as a genuine failure
 * showed "Try now" a second before the next poll quietly succeeded - the user
 * saw a button appear for a problem that was already fixing itself. Two
 * consecutive real failures means something is actually wrong.
 */
const FAILURES_BEFORE_RETRY_BUTTON = 2;

export type QueueEntry = {
  ideaId: string;
  audioUri: string;
  durationSec: number;
  speechLocale: string;
  languageCode: AppLanguageCode;
  attempts: number;
  queuedAt: number;
  /**
   * Set when a real attempt reached the server and still produced nothing.
   * Offline attempts do not set it - the recording is simply waiting, and
   * offering the user a button at that point would just fail again.
   */
  lastAttemptFailed?: boolean;
  lastAttemptAt?: number;
};

let running = false;
let autoTimer: ReturnType<typeof setInterval> | null = null;

/**
 * How often to retry while something is waiting.
 *
 * WHY polling rather than a connectivity listener: it needs no extra
 * dependency, and it also covers the cases a listener misses - a connection
 * that reports up but has no route, or a server that was down and has come
 * back. It costs nothing when the queue is empty, because the drain returns
 * immediately.
 */
const AUTO_RETRY_MS = 15_000;

async function readQueue(): Promise<QueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(entries: QueueEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('[RETRY] could not persist queue', e);
  }
}

/** Queue a take whose transcription did not produce text. */
export async function queueForTranscription(entry: {
  ideaId: string;
  audioUri: string;
  durationSec: number;
  speechLocale: string;
  languageCode: AppLanguageCode;
}): Promise<void> {
  if (!entry.audioUri || !entry.ideaId) return;
  const queue = await readQueue();
  if (queue.some((q) => q.ideaId === entry.ideaId)) return;
  queue.push({ ...entry, attempts: 0, queuedAt: Date.now() });
  await writeQueue(queue);
}

export async function queueSize(): Promise<number> {
  return (await readQueue()).length;
}

export type QueueStatus =
  | { state: 'none' }
  /** Queued, nothing tried yet - almost always no connection. */
  | { state: 'waiting' }
  /** Tried and did not succeed, but worth another go on its own. */
  | { state: 'retrying'; attempts: number }
  /** Repeated real failures. Offer a manual retry. */
  | { state: 'failed'; attempts: number };

/**
 * What the thought view should show.
 *
 * WHY the distinction matters: "waiting for a connection" and "we tried and it
 * did not work" need different messages and different affordances. Showing a
 * retry button to someone with no signal only produces another failure.
 */
export async function queueStatus(ideaId: string): Promise<QueueStatus> {
  const queue = await readQueue();
  const entry = queue.find((q) => q.ideaId === ideaId);
  if (!entry) return { state: 'none' };
  if (entry.lastAttemptFailed && entry.attempts >= FAILURES_BEFORE_RETRY_BUTTON) {
    return { state: 'failed', attempts: entry.attempts };
  }
  /**
   * WHY a distinct 'retrying' state: silently trying again is as opaque to the
   * user as silently failing. Showing the attempt number tells them something
   * is happening and that they do not need to do anything yet.
   */
  if (entry.attempts > 0) {
    return { state: 'retrying', attempts: entry.attempts };
  }
  return { state: 'waiting' };
}

/**
 * Every queued idea's status in one pass.
 *
 * WHY this exists alongside queueStatus: a list screen showing many pending
 * cards used to have no way to tell "waiting for a connection, nothing to
 * see here" apart from "actively being retried right now" without calling
 * queueStatus() once per card - each call re-reading and re-parsing the same
 * AsyncStorage entry. One read for the whole list is enough.
 */
export async function readQueueStatuses(): Promise<Map<string, QueueStatus>> {
  const queue = await readQueue();
  const statuses = new Map<string, QueueStatus>();
  for (const entry of queue) {
    if (entry.lastAttemptFailed && entry.attempts >= FAILURES_BEFORE_RETRY_BUTTON) {
      statuses.set(entry.ideaId, { state: 'failed', attempts: entry.attempts });
    } else if (entry.attempts > 0) {
      statuses.set(entry.ideaId, { state: 'retrying', attempts: entry.attempts });
    } else {
      statuses.set(entry.ideaId, { state: 'waiting' });
    }
  }
  return statuses;
}

/** True when this thought is waiting to be transcribed, for any reason. */
export async function isQueued(ideaId: string): Promise<boolean> {
  const queue = await readQueue();
  return queue.some((q) => q.ideaId === ideaId);
}

/**
 * Retry one thought immediately, ignoring the attempt counter.
 *
 * WHY this exists: the automatic retry runs when the app comes to the
 * foreground, which is invisible. If it fails the user sees an empty transcript
 * with no way to act. A button gives them one, and reports the real reason
 * when it does not work.
 */
export async function retryNow(ideaId: string): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const queue = await readQueue();
  const entry = queue.find((q) => q.ideaId === ideaId);
  if (!entry) return { ok: false, reason: 'This recording is not waiting to be transcribed.' };

  const exists = await recordingExists(entry.audioUri);
  if (!exists) {
    await writeQueue(queue.filter((q) => q.ideaId !== ideaId));
    return { ok: false, reason: 'The audio file for this recording is missing.' };
  }

  try {
    const patch = await enrichPendingRecording(
      {
        audioUri: entry.audioUri,
        durationSec: entry.durationSec,
        transcript: '',
        speechLocale: entry.speechLocale,
      },
      entry.languageCode,
    );

    if (patch && (patch.transcript ?? '').trim()) {
      await useIdeasStore.getState().updateIdea(ideaId, patch);
      await writeQueue(queue.filter((q) => q.ideaId !== ideaId));
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'No speech could be recognised in this recording.',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transcription failed.';
    return {
      ok: false,
      reason: isNetworkError(e)
        ? 'Still no connection. Try again once you are online.'
        : msg,
    };
  }
}

/**
 * Work through the queue once. Safe to call on every app foreground - it exits
 * immediately when the queue is empty or a run is already in progress.
 */
export async function processTranscriptionQueue(): Promise<void> {
  if (running) return;
  const queue = await readQueue();
  if (queue.length === 0) return;

  running = true;
  const remaining: QueueEntry[] = [];

  for (const entry of queue) {
    // The user may have deleted the thought while it was queued.
    const idea = useIdeasStore.getState().ideas.find((i) => i.id === entry.ideaId);
    if (!idea) {
      continue;
    }
    if ((idea.transcript ?? '').trim()) {
      continue;
    }

    // Without the audio there is nothing to retry with.
    const exists = await recordingExists(entry.audioUri);
    if (!exists) {
      continue;
    }

    try {
      const patch = await enrichPendingRecording(
        {
          audioUri: entry.audioUri,
          durationSec: entry.durationSec,
          transcript: '',
          speechLocale: entry.speechLocale,
        },
        entry.languageCode,
      );

      if (patch && (patch.transcript ?? '').trim()) {
        await useIdeasStore.getState().updateIdea(entry.ideaId, patch);
        continue;
      }

      /**
       * Reached the server and got nothing back. That is a real failure, so it
       * counts against the budget and the UI may offer a manual retry.
       */
      const attempts = entry.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) continue;
      remaining.push({
        ...entry,
        attempts,
        lastAttemptFailed: true,
        lastAttemptAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      /**
       * WHY the list is broad, and why the marker is checked first: a
       * connection that has just come back produces a variety of transport
       * errors before it settles - DNS not resolving yet, a socket reset, an
       * aborted request. None of those mean transcription failed, so none
       * should count against the retry budget or surface a button. The
       * marker (see isNetworkError in aiService.ts) catches the case a
       * keyword list alone missed: mapSttError deliberately rewrites the raw
       * error into a friendly message for the user, and that friendly
       * wording does not contain any of these keywords - so a plainly
       * offline failure was falling through to "real failure" below.
       */
      const offline = isNetworkError(e) || msg === '';

      /**
       * WHY offline does not count: a user with no signal for a day would
       * exhaust the retry budget without a single real attempt, and the
       * transcript would be lost for good. It also must not surface a button,
       * because pressing it would only fail again.
       */
      if (offline) {
        remaining.push({ ...entry, lastAttemptFailed: false });
        continue;
      }

      const attempts = entry.attempts + 1;
      if (attempts < MAX_ATTEMPTS) {
        remaining.push({
          ...entry,
          attempts,
          lastAttemptFailed: true,
          lastAttemptAt: Date.now(),
        });
      }
    }
  }

  await writeQueue(remaining);
  running = false;
}

/**
 * Keep retrying in the background while anything is queued.
 *
 * WHY this exists: the drain used to run only when the app came to the
 * foreground. A user who turned their connection on while already inside the
 * app saw nothing happen, and had to press a button - the transcript should
 * simply appear.
 *
 * Safe to call repeatedly; it starts at most one timer and stops itself once
 * the queue empties.
 */
export function startAutoRetry(): void {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    void (async () => {
      const queue = await readQueue();
      if (queue.length === 0) {
        stopAutoRetry();
        return;
      }
      await processTranscriptionQueue();
    })();
  }, AUTO_RETRY_MS);
}

export function stopAutoRetry(): void {
  if (!autoTimer) return;
  clearInterval(autoTimer);
  autoTimer = null;
}

/** Clear everything. Exposed for Settings / debugging. */
export async function clearTranscriptionQueue(): Promise<void> {
  await writeQueue([]);
}
