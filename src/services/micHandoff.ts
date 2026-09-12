import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Microphone handoff — now a no-op.
 *
 * WHY this file is nearly empty: it used to pause the wake-word service, wait
 * for it to release the microphone, then let expo-audio grab it. That handshake
 * existed only because two components each opened their own mic session, and it
 * was the single biggest source of device-specific bugs — the pause could be
 * late, silently fail, or be undone by an OEM restarting the service.
 *
 * The native AudioCaptureService now owns the one and only microphone for the
 * whole app and fans the same frames to the recording and the command
 * recogniser. There is nothing to hand off.
 *
 * The function is kept so existing call sites compile unchanged. Delete the
 * calls at your leisure.
 */
export async function releaseWakeMicForCapture(): Promise<void> {
  useWakeWordStore.getState().setPausedForRecording(true);
}

export function releaseWakeMicAfterCapture(): void {
  useWakeWordStore.getState().setPausedForRecording(false);
}
