import { releaseWakeMicForCapture } from '@/src/services/micHandoff';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Shared entry for mic-button and voice-command recording starts.
 */
export async function beginRecordingSession(
  start: () => Promise<true | null>,
): Promise<boolean> {
  console.log('[RECORDING] start requested');
  await releaseWakeMicForCapture();
  console.log('[RECORDING] wake mic released — starting recorder');
  const ok = await start();
  if (!ok) {
    useWakeWordStore.getState().setPausedForRecording(false);
    console.log('[RECORDING] start failed');
    return false;
  }
  console.log('[RECORDING] recorder started isRecording=true');
  return true;
}
