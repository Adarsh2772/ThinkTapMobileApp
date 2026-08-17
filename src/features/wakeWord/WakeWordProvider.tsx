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
  return children;
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
