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

/**
 * Keep recordings in a stable app documents folder.
 */
export async function persistRecording(tempUri: string): Promise<string> {
  const source = normalizeFileUri(tempUri);

  if (!documentDirectory) {
    return source;
  }

  // Already in our recordings folder — reuse as-is.
  if (source.includes('/recordings/')) {
    return source;
  }

  const folder = `${documentDirectory}recordings/`;
  await makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);

  const extensionMatch = source.match(/\.[a-zA-Z0-9]+$/);
  const extension = extensionMatch?.[0] ?? '.m4a';
  const dest = `${folder}idea-${Date.now()}${extension}`;

  try {
    await copyAsync({ from: source, to: dest });
    const info = await getInfoAsync(dest);
    if (info.exists) {
      return dest;
    }
  } catch {
    // Fall back to original URI if copy fails.
  }

  return source;
}

export async function recordingExists(uri: string): Promise<boolean> {
  const normalized = normalizeFileUri(uri);
  try {
    const info = await getInfoAsync(normalized);
    return Boolean(info.exists && !info.isDirectory);
  } catch {
    return false;
  }
}

export { normalizeFileUri };
