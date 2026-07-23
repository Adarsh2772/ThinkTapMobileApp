import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useState } from 'react';

import { persistRecording } from '@/src/services/audioStorage';

/**
 * Voice-optimized recording (mono / speech-friendly) for better STT accuracy.
 * Closer to what Google / Whisper expect than stereo music presets.
 */
const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 96000,
  directory: 'document',
  isMeteringEnabled: false,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm;codecs=opus',
    bitsPerSecond: 96000,
  },
};

export function useRecording() {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const recorderState = useAudioRecorderState(recorder);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is required to record ideas.');
        return null;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start recording');
      return null;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!recorderState.isRecording && !recorder.isRecording) {
      return null;
    }

    setStopping(true);
    try {
      await recorder.stop();

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });

      const status = recorder.getStatus();
      const tempUri = recorder.uri;
      const seconds = Math.max(
        1,
        Math.round((status.durationMillis || recorderState.durationMillis || 0) / 1000),
      );

      if (!tempUri) {
        setError('Recording file was not saved');
        return null;
      }

      const uri = await persistRecording(tempUri);
      return { uri, durationSec: seconds };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop recording');
      return null;
    } finally {
      setStopping(false);
    }
  }, [recorder, recorderState.durationMillis, recorderState.isRecording]);

  const discard = useCallback(async () => {
    try {
      if (recorder.isRecording || recorderState.isRecording) {
        await recorder.stop();
      }
    } catch {
      // ignore
    }
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
    setError(null);
  }, [recorder, recorderState.isRecording]);

  return {
    status: stopping
      ? ('stopping' as const)
      : recorderState.isRecording
        ? ('recording' as const)
        : ('idle' as const),
    isRecording: recorderState.isRecording,
    durationSec: Math.floor((recorderState.durationMillis || 0) / 1000),
    error,
    start,
    stop,
    discard,
  };
}
