import {
  cacheDirectory,
  deleteAsync,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

/**
 * Ensure the temp chunk directory exists before writing into it.
 *
 * WHY this is required: expo-file-system's writeAsStringAsync does NOT create
 * missing parent directories - it throws ENOENT (No such file or directory).
 * The chunker writes into cache/sarvam-chunks/, which does not exist on a
 * fresh install, so every chunk write failed and the split fell back to
 * sending the whole (too-long) file to Sarvam. Creating the directory first,
 * idempotently, fixes the whole chain.
 */
async function ensureChunkDir(): Promise<string> {
  if (!cacheDirectory) {
    throw new Error('No cache directory available for chunking');
  }
  const dir = `${cacheDirectory}sarvam-chunks/`;
  try {
    const info = await getInfoAsync(dir);
    if (!info.exists) {
      await makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // makeDirectoryAsync throws if it already exists in some SDKs - ignore.
    await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  }
  return dir;
}

/**
 * Splits a long 16-bit PCM WAV recording into short, standalone WAV chunks so
 * each can go to Sarvam's REST speech-to-text endpoint, which accepts at most
 * ~30 seconds per request.
 *
 * ── WHY BYTE-MATH, NOT RE-ENCODING ────────────────────────────────────────
 * A WAV file is a 44-byte header followed by raw PCM samples. Cutting the
 * sample bytes at 30-second boundaries and writing a fresh valid header on
 * each piece copies the audio verbatim - no decode, no re-encode, no gap, no
 * quality loss. Chunk N ends at sample X, chunk N+1 begins at sample X+1, so
 * stitched back together they are a bit-exact copy of the original audio, the
 * same complete audio Whisper used to receive in one larger upload.
 *
 * ── WHY THE OVERLAP ───────────────────────────────────────────────────────
 * A hard cut can land in the middle of a word ("transla|tion"). Each chunk
 * therefore includes a small tail of the previous chunk (OVERLAP_SEC), so any
 * word straddling a boundary is fully present in at least one chunk. The
 * caller (sarvam stitch) removes the duplicated overlap text when joining, so
 * the overlap costs nothing in the final transcript.
 *
 * The original recording file is never modified. Chunks are written to the
 * cache directory and deleted by the caller after transcription.
 */

const DEFAULT_CHUNK_SEC = 25; // safely under Sarvam's 30s ceiling
const OVERLAP_SEC = 1; // shared tail so boundary words aren't lost

const HEADER_BYTES = 44;

type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number; // byte offset where PCM samples start
  dataLength: number; // length of PCM sample bytes
};

export type WavChunk = {
  uri: string;
  index: number;
  /** Seconds of audio shared with the START of this chunk from the previous one. */
  overlapLeadSec: number;
};

// ── base64 <-> bytes (no Buffer in RN) ────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.floor((len * 3) / 4) - pad;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < outLen) out[o++] = (chunk >> 16) & 0xff;
    if (o < outLen) out[o++] = (chunk >> 8) & 0xff;
    if (o < outLen) out[o++] = chunk & 0xff;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 0x3f];
    out += B64[(triple >> 12) & 0x3f];
    out += i + 1 < len ? B64[(triple >> 6) & 0x3f] : '=';
    out += i + 2 < len ? B64[triple & 0x3f] : '=';
  }
  return out;
}

function readU32LE(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
}
function readU16LE(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8)) & 0xffff;
}
function writeU32LE(b: Uint8Array, off: number, v: number): void {
  b[off] = v & 0xff;
  b[off + 1] = (v >> 8) & 0xff;
  b[off + 2] = (v >> 16) & 0xff;
  b[off + 3] = (v >> 24) & 0xff;
}
function writeU16LE(b: Uint8Array, off: number, v: number): void {
  b[off] = v & 0xff;
  b[off + 1] = (v >> 8) & 0xff;
}

/**
 * Parse the RIFF/WAVE header. Walks the chunks to find `fmt ` and `data`
 * rather than assuming a fixed 44-byte layout, so a file with extra metadata
 * chunks still parses correctly.
 */
function parseWav(bytes: Uint8Array): WavInfo {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 || // R
    bytes[1] !== 0x49 || // I
    bytes[2] !== 0x46 || // F
    bytes[3] !== 0x46 // F
  ) {
    throw new Error('Not a RIFF/WAV file');
  }

  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = HEADER_BYTES;
  let dataLength = bytes.length - HEADER_BYTES;

  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = readU32LE(bytes, pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      channels = readU16LE(bytes, body + 2) || 1;
      sampleRate = readU32LE(bytes, body + 4) || 16000;
      bitsPerSample = readU16LE(bytes, body + 14) || 16;
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = Math.min(size, bytes.length - body);
      break;
    }
    // Chunks are word-aligned (padded to even length).
    pos = body + size + (size % 2);
  }

  return { sampleRate, channels, bitsPerSample, dataOffset, dataLength };
}

/** Build a 44-byte PCM WAV header for a data section of `dataLen` bytes. */
function buildHeader(info: WavInfo, dataLen: number): Uint8Array {
  const h = new Uint8Array(HEADER_BYTES);
  const byteRate = (info.sampleRate * info.channels * info.bitsPerSample) / 8;
  const blockAlign = (info.channels * info.bitsPerSample) / 8;
  // "RIFF"
  h[0] = 0x52; h[1] = 0x49; h[2] = 0x46; h[3] = 0x46;
  writeU32LE(h, 4, 36 + dataLen);
  // "WAVE"
  h[8] = 0x57; h[9] = 0x41; h[10] = 0x56; h[11] = 0x45;
  // "fmt "
  h[12] = 0x66; h[13] = 0x6d; h[14] = 0x74; h[15] = 0x20;
  writeU32LE(h, 16, 16);
  writeU16LE(h, 20, 1); // PCM
  writeU16LE(h, 22, info.channels);
  writeU32LE(h, 24, info.sampleRate);
  writeU32LE(h, 28, byteRate);
  writeU16LE(h, 32, blockAlign);
  writeU16LE(h, 34, info.bitsPerSample);
  // "data"
  h[36] = 0x64; h[37] = 0x61; h[38] = 0x74; h[39] = 0x61;
  writeU32LE(h, 40, dataLen);
  return h;
}

function normalizeFileUri(uri: string): string {
  if (uri.startsWith('/') && !uri.startsWith('file:')) return `file://${uri}`;
  return uri;
}

/** Duration of a WAV in seconds, read from its header. */
export async function wavDurationSec(uri: string): Promise<number> {
  const b64 = await readAsStringAsync(normalizeFileUri(uri), {
    encoding: EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  const info = parseWav(bytes);
  const bytesPerSec = (info.sampleRate * info.channels * info.bitsPerSample) / 8;
  return bytesPerSec > 0 ? info.dataLength / bytesPerSec : 0;
}

/**
 * Split `uri` into standalone WAV chunk files of at most `chunkSec` seconds
 * (default 25), each carrying `OVERLAP_SEC` seconds of the previous chunk's
 * tail at its start. Returns the chunks in order. If the recording already
 * fits in one chunk, returns a single entry pointing at a fresh copy so the
 * caller can treat every case uniformly.
 *
 * Caller must call `cleanupChunks` when done to remove the temp files.
 */
export async function splitWavIntoChunks(
  uri: string,
  chunkSec: number = DEFAULT_CHUNK_SEC,
): Promise<WavChunk[]> {
  const src = normalizeFileUri(uri);
  const b64 = await readAsStringAsync(src, { encoding: EncodingType.Base64 });
  const bytes = base64ToBytes(b64);
  const info = parseWav(bytes);

  const blockAlign = Math.max(1, (info.channels * info.bitsPerSample) / 8);
  const bytesPerSec = info.sampleRate * blockAlign;
  if (bytesPerSec <= 0) throw new Error('WAV header has invalid sample rate');

  // Work in whole sample frames so we never cut mid-sample.
  const alignDown = (n: number) => n - (n % blockAlign);

  const chunkBytes = alignDown(bytesPerSec * chunkSec);
  const overlapBytes = alignDown(bytesPerSec * OVERLAP_SEC);
  const dataStart = info.dataOffset;
  const dataEnd = info.dataOffset + info.dataLength;

  // Create the temp directory up front - writeAsStringAsync will not.
  const dir = await ensureChunkDir();
  const chunks: WavChunk[] = [];

  // Single-chunk fast path: short recording, one temp copy.
  if (info.dataLength <= chunkBytes) {
    const outUri = `${dir}chunk_${Date.now()}_0.wav`;
    await writeChunkFile(outUri, info, bytes.subarray(dataStart, dataEnd));
    return [{ uri: outUri, index: 0, overlapLeadSec: 0 }];
  }

  let index = 0;
  let cursor = dataStart;
  const stamp = Date.now();
  while (cursor < dataEnd) {
    // Start each chunk (after the first) OVERLAP_SEC earlier so a word on the
    // boundary is whole in this chunk.
    const start = index === 0 ? cursor : Math.max(dataStart, cursor - overlapBytes);
    const end = Math.min(dataEnd, cursor + chunkBytes);
    const overlapLeadSec = index === 0 ? 0 : (cursor - start) / bytesPerSec;

    const outUri = `${dir}chunk_${stamp}_${index}.wav`;
    await writeChunkFile(outUri, info, bytes.subarray(start, end));
    chunks.push({ uri: outUri, index, overlapLeadSec });

    cursor = end;
    index += 1;
  }

  return chunks;
}

async function writeChunkFile(
  outUri: string,
  info: WavInfo,
  data: Uint8Array | Uint8Array,
): Promise<void> {
  const header = buildHeader(info, data.length);
  const full = new Uint8Array(header.length + data.length);
  full.set(header, 0);
  full.set(data, header.length);
  await writeAsStringAsync(outUri, bytesToBase64(full), {
    encoding: EncodingType.Base64,
  });
}

/** Delete temp chunk files. Safe to call with any of the returned chunks. */
export async function cleanupChunks(chunks: WavChunk[]): Promise<void> {
  await Promise.all(
    chunks.map((c) => deleteAsync(c.uri, { idempotent: true }).catch(() => {})),
  );
}
