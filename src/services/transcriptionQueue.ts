import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

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
 * WHY an exhausted entry is kept, not dropped: it used to be silently
 * removed from the queue once MAX_ATTEMPTS genuine failures were reached.
 * queueStatus() then found nothing at all for that idea and reported
 * 'none' - and since a failed attempt never calls updateIdea(), the idea
 * screen's pipelineFinished signal was also still false. The result: the
 * screen fell through to its "still working" spinner forever, for a take
 * the queue had already, permanently, given up on - exactly the stuck-
 * loading-indicator failure this whole area of the app exists to prevent.
 * An exhausted entry now stays in the queue at 'failed', visible and
 * queryable, but is skipped rather than retried automatically - only the
 * user's own "Try again" (retryNow, which ignores this counter entirely)
 * can act on it from here.
 */

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
  /**
   * Set once MAX_ATTEMPTS genuine failures have been reached. The entry is
   * kept, not dropped, once this is true - see the note at MAX_ATTEMPTS for
   * why dropping it was the actual bug.
   */
  exhausted?: boolean;
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

/**
 * Tracks the FIRST, non-queued enrichment attempt for a recording - the one
 * that runs synchronously right after a take is saved, before anything has
 * failed and before queueForTranscription() has ever been called.
 *
 * WHY this exists: without it, "is a transcript genuinely still being worked
 * on right now" had no real signal at all for that first attempt. The idea
 * detail screen fell back to guessing from a hardcoded time window since idea
 * creation, which meant a slow but perfectly healthy attempt (a long
 * recording, a slow connection, several sequential AI steps) had its loading
 * indicator vanish and replaced with a message claiming failure while the
 * real attempt was still quietly working. This marker is the authoritative
 * answer instead of a guess.
 *
 * Persisted, not just in-memory, so it survives the app being backgrounded
 * and the idea screen being closed and reopened while the attempt runs.
 */
const ACTIVE_ENRICHMENT_KEY = '@thinktap/active_enrichment';

/**
 * WHY a stale cap: if the app is killed mid-attempt, nothing runs the
 * "finished" cleanup, and without this cap the marker would claim "still
 * attempting" forever - the exact stuck-loading-indicator failure this whole
 * mechanism exists to prevent, just moved to a different signal. Three
 * minutes is generously longer than any real attempt (upload capped at 20s,
 * a couple of LLM calls after that) should ever take.
 */
const ACTIVE_ENRICHMENT_STALE_MS = 3 * 60_000;

export async function markEnrichmentStarted(ideaId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ACTIVE_ENRICHMENT_KEY,
      JSON.stringify({ ideaId, startedAt: Date.now() }),
    );
  } catch {
    // Best-effort - worst case the loading indicator falls back to the
    // queue-based states, which still work correctly on their own.
  }
}

/** Only clears the marker if it still belongs to this idea, so a second
 * recording started before the first one's marker was cleared cannot have
 * its own in-flight marker wiped out from under it. */
export async function markEnrichmentFinished(ideaId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_ENRICHMENT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { ideaId?: string };
    if (parsed?.ideaId === ideaId) {
      await AsyncStorage.removeItem(ACTIVE_ENRICHMENT_KEY);
    }
  } catch {
    // Best-effort.
  }
}

async function isEnrichmentActive(ideaId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_ENRICHMENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { ideaId?: string; startedAt?: number };
    if (parsed?.ideaId !== ideaId) return false;
    if (
      typeof parsed.startedAt === 'number' &&
      Date.now() - parsed.startedAt > ACTIVE_ENRICHMENT_STALE_MS
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * WHY checked before attempting anything: without this, every scheduled poll
 * made a real network request regardless of connectivity - wasted battery on
 * a request known in advance to fail, and each attempt while genuinely
 * offline was one more chance to hit a slow, doomed request instead of
 * failing fast. No connection means nothing is attempted at all; the
 * reconnect listener below and the next poll pick this back up the moment a
 * connection actually exists.
 *
 * isInternetReachable can be null on some platforms/older OS versions where
 * the OS does not report it - treated as "assume reachable" so those devices
 * fall back to the old attempt-and-catch behaviour rather than never
 * retrying at all.
 */
async function hasConnection(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

let reconnectSub: { remove: () => void } | null = null;

/**
 * Fires a retry the moment the OS reports connectivity returning, instead of
 * waiting for the next scheduled poll (up to AUTO_RETRY_MS late).
 */
function ensureReconnectListener(): void {
  if (reconnectSub) return;
  try {
    reconnectSub = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void processTranscriptionQueue();
      }
    });
  } catch {
    // Not available on this platform - the interval poll still covers it.
  }
}

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
  /** The FIRST, non-queued attempt is genuinely running right now. */
  | { state: 'attempting' }
  /** Queued, connection available, nothing tried yet. */
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
  /**
   * WHY checked before the queue at all: an idea on its first, non-queued
   * attempt is not IN the queue yet - queueForTranscription() only runs
   * after that first attempt has already failed.
   */
  if (await isEnrichmentActive(ideaId)) return { state: 'attempting' };

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

  /**
   * WHY this comes before anything else: skips the attempt entirely rather
   * than making a real request known in advance to fail. The queue simply
   * waits, correctly reported as 'waiting', until hasConnection() or the
   * reconnect listener says it is worth trying again.
   */
  if (!(await hasConnection())) return;

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

    // Exhausted entries are kept for their status but never retried
    // automatically again - see the note at MAX_ATTEMPTS above.
    if (entry.exhausted) {
      remaining.push(entry);
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
      remaining.push({
        ...entry,
        attempts,
        lastAttemptFailed: true,
        lastAttemptAt: Date.now(),
        exhausted: attempts >= MAX_ATTEMPTS,
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
      remaining.push({
        ...entry,
        attempts,
        lastAttemptFailed: true,
        lastAttemptAt: Date.now(),
        exhausted: attempts >= MAX_ATTEMPTS,
      });
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
  ensureReconnectListener();
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
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  if (reconnectSub) {
    reconnectSub.remove();
    reconnectSub = null;
  }
}

/** Clear everything. Exposed for Settings / debugging. */
export async function clearTranscriptionQueue(): Promise<void> {
  await writeQueue([]);
}
