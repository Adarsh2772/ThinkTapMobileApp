import { createAudioPlayer } from 'expo-audio';
import {
  copyAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
} from 'expo-file-system/legacy';

import { createId } from '@/src/utils/format';

function normalizeFileUri(uri: string): string {
  if (!uri) return uri;
  // Android sometimes returns paths without the file:// scheme.
  if (uri.startsWith('/') && !uri.startsWith('file:')) {
    return `file://${uri}`;
  }
  return uri;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Wait until the recorder has flushed bytes so copy/probe see a complete file. */
export async function waitForFileFlush(uri: string, timeoutMs = 1600): Promise<number> {
  const source = normalizeFileUri(uri);
  if (!source) return 0;
  let lastSize = -1;
  let stableHits = 0;
  const deadline = Date.now() + Math.max(200, timeoutMs);
  while (Date.now() < deadline) {
    try {
      const info = await getInfoAsync(source);
      const size = info.exists && 'size' in info ? Number(info.size ?? 0) : 0;
      if (size > 0 && size === lastSize) {
        stableHits += 1;
        if (stableHits >= 2) return size;
      } else {
        stableHits = 0;
        lastSize = size;
      }
    } catch {
      // keep waiting
    }
    await delay(80);
  }
  return lastSize > 0 ? lastSize : 0;
}

function extensionFor(uri: string): string {
  const match = uri.match(/\.[a-zA-Z0-9]+(?:\?.*)?$/);
  const ext = match?.[0]?.replace(/\?.*$/, '').toLowerCase() ?? '';
  if (ext && ext !== '.') return ext;
  return '.wav';
}

export async function ensureRecordingsDirectory(): Promise<string> {
  if (!documentDirectory) return '';
  const folder = `${documentDirectory}recordings/`;
  await makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  return folder;
}

/**
 * Copy (then move) the take into app documents so the next recording cannot
 * delete the cache file. Unique names so back-to-back takes never collide.
 */
export async function persistRecording(tempUri: string): Promise<string> {
  const source = normalizeFileUri(tempUri);

  if (!documentDirectory) {
    return source;
  }

  if (source.includes('/recordings/')) {
    return source;
  }

  await waitForFileFlush(source, 2200);

  const folder = await ensureRecordingsDirectory();
  const dest = `${folder}idea-${Date.now()}-${createId()}${extensionFor(source)}`;

  try {
    await copyAsync({ from: source, to: dest });
    const size = await waitForFileFlush(dest, 1000);
    if (size > 0) return dest;
  } catch {
    // try move below
  }

  try {
    await moveAsync({ from: source, to: dest });
    const size = await waitForFileFlush(dest, 1000);
    if (size > 0) return dest;
  } catch {
    // Fall back to original URI if copy/move fail.
  }

  if (__DEV__) {
    console.warn('[AUDIO] persist fell back to temp URI', source);
  }
  return source;
}

export async function recordingExists(uri: string): Promise<boolean> {
  const normalized = normalizeFileUri(uri);
  if (!normalized) return false;
  try {
    const info = await getInfoAsync(normalized);
    return Boolean(info.exists && !info.isDirectory);
  } catch {
    return false;
  }
}

/** Read duration from a saved file. Used so Ideas/playback match captured audio. */
export async function probeAudioDurationSec(
  uri: string,
  timeoutMs = 2500,
): Promise<number | null> {
  const source = normalizeFileUri(uri);
  if (!source) return null;
  let player: ReturnType<typeof createAudioPlayer> | null = null;
  try {
    player = createAudioPlayer(source, { updateInterval: 80, keepAudioSessionActive: false });
    const deadline = Date.now() + Math.max(200, timeoutMs);
    while (Date.now() < deadline) {
      const seconds = player.duration;
      if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
        return Math.max(1, Math.round(seconds));
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  } catch {
    // fall through — caller keeps the timer duration
  } finally {
    try {
      player?.remove();
    } catch {
      // ignore
    }
  }
  return null;
}

export { normalizeFileUri };
