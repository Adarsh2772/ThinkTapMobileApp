import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/ScreenHeader';
import { VoiceAssistantStage } from '@/src/features/voiceAssistant/VoiceAssistantStage';
import { getSpeechLocale } from '@/src/features/languageTranscript/locales';
import { useIdeaCapture } from '@/src/hooks/useIdeaCapture';
import { useDrawerOptional } from '@/src/navigation/DrawerContext';
import { releaseWakeMicForCapture } from '@/src/services/micHandoff';
import { resolveSpokenLanguage } from '@/src/i18n/languages';
import {
  buildLocalIdea,
  enrichPendingRecording,
} from '@/src/services/processRecording';
import type { ProcessingStage } from '@/src/types';
import {
  announceRecordingStarted,
  announceRecordingStopped,
} from '@/src/services/recordingFeedback';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { usePendingRecordingStore } from '@/src/store/pendingRecordingStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { showToast } from '@/src/store/toastStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts } from '@/src/theme/tokens';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const setPending = usePendingRecordingStore((s) => s.setPending);
  const clearPending = usePendingRecordingStore((s) => s.clearPending);
  const addIdea = useIdeasStore((s) => s.addIdea);
  const updateIdea = useIdeasStore((s) => s.updateIdea);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const drawer = useDrawerOptional();
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const triggerAt = useWakeWordStore((s) => s.triggerAt);
  const stopToken = useWakeWordStore((s) => s.stopToken);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const captureStarting = useWakeWordStore((s) => s.captureStarting);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);
  const setCaptureStarting = useWakeWordStore((s) => s.setCaptureStarting);
  const lastTrigger = useRef(0);
  const lastStop = useRef(0);
  const mountIdRef = useRef(Math.random().toString(36).slice(2, 7));
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    if (__DEV__) {
      console.log('[HOME] mount', mountIdRef.current);
      return () => console.log('[HOME] unmount', mountIdRef.current);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  const [organizing, setOrganizing] = useState(false);
  const [organizeStage, setOrganizeStage] = useState<ProcessingStage>('uploading');
  const [detectedLanguageName, setDetectedLanguageName] = useState<string | null>(null);
  const processLockRef = useRef(false);

  const {
    isRecording,
    isPaused,
    durationSec,
    error,
    getLastError,
    start,
    pause,
    resume,
    stop,
    discard,
    status,
    setVoiceStopHandler,
    setVoicePauseHandler,
    setVoiceResumeHandler,
    supportsVoiceStop,
    liveTranscript,
    speechLocale,
    micShareFailed,
    captureMode,
  } = useIdeaCapture({
    onCaptureFailed: (message) => {
      showToast(message, 'error');
      Alert.alert('Cannot record', message);
    },
    onInterrupted: () => {
      showToast('Recording paused — call in progress', 'info');
    },
    onSilencePause: () => {
      showToast('Recording paused — no speech for 10 seconds', 'info');
    },
  });
  const stoppingRef = useRef(false);
  const finishLockRef = useRef(false);
  const pauseBusyRef = useRef(false);

  const runOrganizeInBackground = useCallback(
    async (pending: {
      audioUri: string;
      durationSec: number;
      transcript: string;
      speechLocale: string;
    }) => {
      if (!user || processLockRef.current) return;
      processLockRef.current = true;
      setOrganizeStage('uploading');
      setDetectedLanguageName(null);
      setOrganizing(true);

      const localIdea = buildLocalIdea(user.id, pending, languageCode);
      try {
        await addIdea(localIdea);
        clearPending();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not save this recording';
        showToast(message, 'error');
        setOrganizing(false);
        processLockRef.current = false;
        return;
      }

      try {
        const patch = await enrichPendingRecording(pending, languageCode, (stage) => {
          setOrganizeStage(stage);
        });
        if (patch && (patch.transcript || patch.title)) {
          if (patch.language && patch.transcript) {
            setDetectedLanguageName(resolveSpokenLanguage(patch.language).name);
          }
          setOrganizeStage('done');
          await updateIdea(localIdea.id, patch);
          showToast('Idea ready in Ideas');
        }
      } catch (e) {
        console.warn('Transcription failed after save', e);
        showToast('Saved. Transcript will appear when the network is ready.', 'info');
      } finally {
        setOrganizing(false);
        processLockRef.current = false;
      }
    },
    [user, languageCode, addIdea, updateIdea, clearPending],
  );

  const finishRecording = useCallback(async () => {
    if (finishLockRef.current || stoppingRef.current) return;
    finishLockRef.current = true;
    stoppingRef.current = true;
    setPausedForRecording(true);
    try {
      const result = await stop();
      if (!result) {
        const reason = getLastError() ?? 'Nothing was captured in this take.';
        showToast(reason, 'error');
        return;
      }
      showToast('Your idea has been saved successfully');
      await announceRecordingStopped();
      const pending = {
        audioUri: result.uri,
        durationSec: result.durationSec,
        transcript: result.transcript,
        speechLocale: result.speechLocale,
      };
      setPending(pending);
      void runOrganizeInBackground(pending);
    } finally {
      stoppingRef.current = false;
      finishLockRef.current = false;
    }
  }, [
    stop,
    getLastError,
    setPausedForRecording,
    setPending,
    runOrganizeInBackground,
  ]);

  const onPausePress = useCallback(async () => {
    if (pauseBusyRef.current || stoppingRef.current) return;
    pauseBusyRef.current = true;
    try {
      const ok = await pause();
      if (ok) showToast('Recording paused');
      else showToast(error ?? 'Could not pause', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  }, [pause, error]);

  const onResumePress = useCallback(async () => {
    if (pauseBusyRef.current || stoppingRef.current) return;
    pauseBusyRef.current = true;
    try {
      const ok = await resume();
      if (ok) showToast('Recording resumed');
      else showToast(error ?? 'Could not resume', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  }, [resume, error]);

  // OS STT session: spoken Stop / Pause / Resume.
  useEffect(() => {
    setVoiceStopHandler(() => {
      showToast('Heard “Stop” — finishing recording');
      void finishRecording();
    });
    setVoicePauseHandler(() => {
      showToast('Heard “Pause”');
      void onPausePress();
    });
    setVoiceResumeHandler(() => {
      showToast('Heard “Resume”');
      void onResumePress();
    });
    return () => {
      setVoiceStopHandler(null);
      setVoicePauseHandler(null);
      setVoiceResumeHandler(null);
    };
  }, [
    setVoiceStopHandler,
    setVoicePauseHandler,
    setVoiceResumeHandler,
    finishRecording,
    onPausePress,
    onResumePress,
  ]);

  // "Hey Think Tap" / "start recording" → start capture once the wake mic is free
  // and the app is in the foreground (SpeechRecognizer cannot start from background).
  // WakeWordProvider already routes to Home for this token.
  useEffect(() => {
    if (!triggerToken || triggerToken === lastTrigger.current) return;
    if (appState !== 'active') return;
    lastTrigger.current = triggerToken;
    if (Date.now() - triggerAt > 30_000) {
      setCaptureStarting(false);
      return;
    }
    if (isRecording || status === 'stopping' || stoppingRef.current) return;

    // Holds the wake listener off for the whole handoff. Releasing the mic
    // takes a few seconds, and without this the listener's resume timer can
    // grab the mic back before the recognizer has it.
    setCaptureStarting(true);
    void (async () => {
      try {
        await releaseWakeMicForCapture();
        const ok = await start();
        if (!ok) {
          showToast('Could not start recording', 'error');
          Alert.alert('Hey Think Tap', 'Heard the wake phrase, but recording could not start.');
          return;
        }
        showToast('Recording started');
        await announceRecordingStarted();
      } finally {
        setCaptureStarting(false);
      }
    })();
  }, [triggerToken, triggerAt, appState, isRecording, status, start, setCaptureStarting]);

  // Spoken "stop recording" from the native service (app minimized) or a
  // pending stop consumed when the activity became visible again.
  useEffect(() => {
    if (!stopToken || stopToken === lastStop.current) return;
    lastStop.current = stopToken;
    if (!isRecording && status !== 'stopping') return;
    if (stoppingRef.current) return;
    showToast('Heard “Stop” — finishing recording');
    void finishRecording();
  }, [stopToken, isRecording, status, finishRecording]);

  const onMicPress = async () => {
    if (stoppingRef.current || status === 'stopping') return;

    if (isRecording) {
      await finishRecording();
      return;
    }

    setCaptureStarting(true);
    try {
      await releaseWakeMicForCapture();
      const ok = await start();
      if (!ok) {
        showToast(error ?? 'Microphone permission required', 'error');
        if (error) Alert.alert('Microphone', error);
        return;
      }
      showToast('Recording started');
      await announceRecordingStarted();
    } finally {
      setCaptureStarting(false);
    }
  };

  const onLongDiscard = () => {
    if (!isRecording) return;
    Alert.alert('Discard recording?', 'This will delete the current take.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await discard();
            showToast('Recording discarded', 'info');
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.page}>
        <ScreenHeader
          title={`Hello, ${user?.firstName ?? 'Creator'}`}
          subtitle={tx('readyForIdea')}
          right={
            <Pressable
              onPress={() => drawer?.openDrawer()}
              style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.avatarText}>
                {(user?.firstName?.[0] ?? 'T').toUpperCase()}
              </Text>
            </Pressable>
          }
        />

        <View style={styles.content}>
          <VoiceAssistantStage
            isRecording={isRecording || status === 'stopping'}
            isPaused={isPaused}
            isStarting={captureStarting && !isRecording && status !== 'stopping'}
            durationSec={durationSec}
            liveTranscript={liveTranscript}
            transcribingPlaceholder={micShareFailed || captureMode === 'audio-file'}
            wakeEnabled={wakeEnabled}
            supportsVoiceStop={supportsVoiceStop}
            speechLocaleName={isRecording ? getSpeechLocale(speechLocale).name : undefined}
            onPress={() => void onMicPress()}
            onPause={() => void onPausePress()}
            onResume={() => void onResumePress()}
            onLongPress={onLongDiscard}
            labelIdle={tx('tapToRecord')}
            labelRecording={status === 'stopping' ? 'Stopping…' : tx('recording')}
            labelPaused="Paused — tap Resume to continue"
          />
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodySemi,
    color: colors.onPrimary,
  },
});
