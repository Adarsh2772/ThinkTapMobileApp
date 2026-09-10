import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { IdeaCaptureProvider } from '@/src/features/capture/IdeaCaptureProvider';
import { useWakeWordListener } from '@/src/hooks/useWakeWordListener';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Mount once under the authenticated app tree to run wake-word listening
 * and route voice commands to the global recording session.
 */
export function WakeWordProvider({ children }: { children: ReactNode }) {
  return (
    <IdeaCaptureProvider>
      <WakeWordListenerMount />
      <WakeNavigateOnWake />
      <PauseWakeWhileCapturing />
      {children}
    </IdeaCaptureProvider>
  );
}

function WakeWordListenerMount() {
  useWakeWordListener();
  return null;
}

function PauseWakeWhileCapturing() {
  const captureActive = useWakeWordStore((s) => s.captureActive);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);

  useEffect(() => {
    if (captureActive) {
      setPausedForRecording(true);
      return;
    }
    const timer = setTimeout(() => setPausedForRecording(false), 1200);
    return () => clearTimeout(timer);
  }, [captureActive, setPausedForRecording]);

  return null;
}

function WakeNavigateOnWake() {
  const router = useRouter();
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const lastToken = useRef(0);

  useEffect(() => {
    if (!triggerToken || triggerToken === lastToken.current) return;
    lastToken.current = triggerToken;
    router.replace('/(tabs)/');
  }, [triggerToken, router]);

  return null;
}
