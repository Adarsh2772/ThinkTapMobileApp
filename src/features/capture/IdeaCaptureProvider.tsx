import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';

import { useIdeaCapture } from '@/src/hooks/useIdeaCapture';
import { beginRecordingSession } from '@/src/services/recordingSession';
import { announceRecordingStarted } from '@/src/services/recordingFeedback';
import { showToast } from '@/src/store/toastStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';

type IdeaCaptureContextValue = ReturnType<typeof useIdeaCapture>;

const IdeaCaptureContext = createContext<IdeaCaptureContextValue | null>(null);

export function useIdeaCaptureContext(): IdeaCaptureContextValue {
  const ctx = useContext(IdeaCaptureContext);
  if (!ctx) {
    throw new Error('useIdeaCaptureContext must be used within IdeaCaptureProvider');
  }
  return ctx;
}

/**
 * App-wide recording session — voice commands and the mic button share one
 * useIdeaCapture instance regardless of which tab is mounted.
 */
export function IdeaCaptureProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const capture = useIdeaCapture();
  const { isRecording, status, start } = capture;

  const lastTriggerRef = useRef(0);
  const voiceStartLockRef = useRef(false);

  const tryStart = useCallback(async () => {
    return beginRecordingSession(start);
  }, [start]);

  useEffect(() => {
    if (!triggerToken || triggerToken === lastTriggerRef.current) return;
    lastTriggerRef.current = triggerToken;
    if (isRecording || status === 'stopping' || voiceStartLockRef.current) return;

    console.log('[VOICE] command handler called token=', triggerToken);
    router.replace('/(tabs)/');

    void (async () => {
      voiceStartLockRef.current = true;
      try {
        const ok = await tryStart();
        if (!ok) {
          showToast('Could not start recording', 'error');
          Alert.alert('Hey Think Tap', 'Heard the wake phrase, but recording could not start.');
          return;
        }
        console.log('[VOICE] recording started from voice command');
        showToast('Recording started');
        await announceRecordingStarted();
      } finally {
        voiceStartLockRef.current = false;
      }
    })();
  }, [triggerToken, isRecording, status, tryStart, router]);

  return (
    <IdeaCaptureContext.Provider value={capture}>{children}</IdeaCaptureContext.Provider>
  );
}
