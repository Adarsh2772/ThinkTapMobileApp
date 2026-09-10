import { releaseWakeMicForCapture } from '@/src/services/micHandoff';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Shared entry for mic-button and voice-command recording starts.
 */
export async function beginRecordingSession(
  start: () => Promise<true | null>,
): Promise<boolean> {
  const pressedAt = Date.now();
  console.log(`RECORDING: Start button pressed: ${pressedAt}`);
  await releaseWakeMicForCapture();
  console.log(`RECORDING: permission/handoff done: ${Date.now()} (+${Date.now() - pressedAt}ms)`);
  const ok = await start();
  if (!ok) {
    useWakeWordStore.getState().setPausedForRecording(false);
    console.log('RECORDING: start failed');
    return false;
  }
  console.log(
    `RECORDING: recorder started isRecording=true: ${Date.now()} (+${Date.now() - pressedAt}ms)`,
  );
  return true;
}
