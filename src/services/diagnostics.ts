import { Platform } from 'react-native';

/**
 * In-app log buffer.
 *
 * WHY this exists: bugs are reported from devices the developer does not have,
 * and `adb logcat` is not something a tester can run. Without device detail
 * every report is a guess.
 *
 * Warnings and errors are mirrored into a ring buffer that Settings can share
 * as plain text. The tester taps Share and sends it — no cable, no tooling.
 *
 * Only warnings and errors are captured, because routine logging was removed
 * for release. That keeps a shared report short and readable.
 */

const MAX_LINES = 300;

/** Only the app's own tags are kept — the rest is React Native noise. */
const KEEP = /\[(NATIVE|CAPTURE|WAKE|STT|AI|RETRY|HOME)\]|ThinkTap/;

type Entry = { at: number; level: string; text: string };

const buffer: Entry[] = [];
let installed = false;

function push(level: string, args: unknown[]): void {
  let text: string;
  try {
    text = args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  } catch {
    return;
  }

  if (!KEEP.test(text)) return;

  buffer.push({ at: Date.now(), level, text });
  if (buffer.length > MAX_LINES) buffer.shift();
}

/**
 * Wrap console so existing warnings are captured without touching call sites.
 * Safe to call more than once.
 */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  const original = {
    warn: console.warn,
    error: console.error,
  };

  console.warn = (...args: unknown[]) => {
    push('WARN', args);
    original.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    push('ERROR', args);
    original.error(...args);
  };
}

/** Explicit entry for things that never go through console. */
export function logDiagnostic(text: string): void {
  buffer.push({ at: Date.now(), level: 'DIAG', text });
  if (buffer.length > MAX_LINES) buffer.shift();
}

function clockOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Everything a bug report needs, as plain text. */
export function buildReport(extra?: Record<string, unknown>): string {
  const header = [
    'ThinkTap diagnostics',
    `Generated: ${new Date().toISOString()}`,
    `Platform: ${Platform.OS} ${String(Platform.Version)}`,
    `Entries: ${buffer.length}`,
  ];

  if (extra) {
    header.push('');
    header.push('--- State ---');
    for (const [k, v] of Object.entries(extra)) {
      header.push(`${k}: ${String(v)}`);
    }
  }

  header.push('');
  header.push('--- Warnings and errors ---');

  const lines =
    buffer.length === 0
      ? ['(none recorded)']
      : buffer.map((e) => `${clockOf(e.at)} ${e.level} ${e.text}`);

  return [...header, ...lines].join('\n');
}

export function logCount(): number {
  return buffer.length;
}

export function clearLogs(): void {
  buffer.length = 0;
}
