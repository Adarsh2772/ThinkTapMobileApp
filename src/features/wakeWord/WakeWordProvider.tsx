import type { ReactNode } from 'react';

import { useWakeWordListener } from '@/src/hooks/useWakeWordListener';

/** Mount once under the authenticated app tree to run wake-word listening. */
export function WakeWordProvider({ children }: { children: ReactNode }) {
  useWakeWordListener();
  return children;
}
