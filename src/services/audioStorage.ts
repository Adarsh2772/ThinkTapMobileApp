import {
  copyAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';

function normalizeFileUri(uri: string): string {
  if (!uri) return uri;
  // Android sometimes returns paths without the file:// scheme.
  if (uri.startsWith('/') && !uri.startsWith('file:')) {
    return `file://${uri}`;
  }
  return uri;
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
 * Keep recordings in a stable app documents folder.
 */
export async function persistRecording(tempUri: string): Promise<string> {
  const source = normalizeFileUri(tempUri);

  if (!documentDirectory) {
    return source;
  }

  if (source.includes('/recordings/')) {
    return source;
  }

  const folder = await ensureRecordingsDirectory();
  const dest = `${folder}idea-${Date.now()}${extensionFor(source)}`;

  try {
    await copyAsync({ from: source, to: dest });
    const info = await getInfoAsync(dest);
    if (info.exists && (!('size' in info) || (info.size ?? 0) > 0)) {
      return dest;
    }
  } catch {
    // Fall back to original URI if copy fails.
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

export { normalizeFileUri };
