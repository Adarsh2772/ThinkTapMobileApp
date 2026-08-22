import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import { useWakeWordListener } from '@/src/hooks/useWakeWordListener';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

/**
 * Mount once under the authenticated app tree to run wake-word listening
 * and always land on the Home tab when "Hey Think Tap" is heard.
 */
export function WakeWordProvider({ children }: { children: ReactNode }) {
  useWakeWordListener();
  useNavigateHomeOnWake();
  usePauseWakeWhileCapturing();
  return children;
}

/**
 * Owns the pause/resume window around a take. This lives here, not on Home:
 * navigating to Processing or an idea tears Home's effects down, which used to
 * strand the listener in the paused state so the wake phrase stopped working.
 */
function usePauseWakeWhileCapturing() {
  const captureActive = useWakeWordStore((s) => s.captureActive);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);

  useEffect(() => {
    if (captureActive) {
      setPausedForRecording(true);
      return;
    }
    const timer = setTimeout(() => setPausedForRecording(false), 4000);
    return () => clearTimeout(timer);
  }, [captureActive, setPausedForRecording]);
}

function useNavigateHomeOnWake() {
  const router = useRouter();
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const lastToken = useRef(0);

  useEffect(() => {
    if (!triggerToken || triggerToken === lastToken.current) return;
    lastToken.current = triggerToken;
    // Always open the Think Tap Home tab (index) before recording starts.
    router.replace('/(tabs)');
  }, [triggerToken, router]);
}
