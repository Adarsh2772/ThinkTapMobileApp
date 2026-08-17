import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { showToast } from '@/src/store/toastStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

async function requestWakePermissions(): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS === 'android') {
    const mic = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone',
        message: 'Think Tap needs the microphone for Hey Think Tap and recording ideas.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    if (mic !== PermissionsAndroid.RESULTS.GRANTED) {
      return { ok: false, message: 'Microphone permission is required for Hey Think Tap.' };
    }

    if (Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
        title: 'Notifications',
        message:
          'Allow notifications so Think Tap can keep listening for Hey Think Tap in the background.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
    }
  }

  try {
    const speech = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!speech.granted) {
      return {
        ok: false,
        message: 'Speech recognition permission is required for Hey Think Tap.',
      };
    }
  } catch {
    // Module may be unavailable in some builds; mic alone still helps recording.
  }

  return { ok: true };
}

/**
 * First-launch prompt: enable Hey Think Tap and request mic / speech / notification permissions.
 */
export function WakeWordPermissionGate() {
  const hydrated = useWakeWordStore((s) => s.hydrated);
  const onboardingDone = useWakeWordStore((s) => s.onboardingDone);
  const setEnabled = useWakeWordStore((s) => s.setEnabled);
  const setOnboardingDone = useWakeWordStore((s) => s.setOnboardingDone);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hydrated && !onboardingDone) {
      setVisible(true);
    }
  }, [hydrated, onboardingDone]);

  const onEnable = async () => {
    setBusy(true);
    try {
      const result = await requestWakePermissions();
      if (!result.ok) {
        showToast(result.message ?? 'Permission denied', 'error');
        return;
      }
      await setEnabled(true);
      await setOnboardingDone(true);
      setVisible(false);
      showToast('Hey Think Tap is on — say it anytime to record');
    } finally {
      setBusy(false);
    }
  };

  const onSkip = async () => {
    setBusy(true);
    try {
      await setEnabled(false);
      await setOnboardingDone(true);
      setVisible(false);
      showToast('You can enable Hey Think Tap later in Settings', 'info');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => void onSkip()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Welcome to Think Tap</Text>
          <Text style={styles.title}>Enable Hey Think Tap?</Text>
          <Text style={styles.body}>
            Allow the microphone (and notifications on Android) so you can say “Hey Think Tap” to
            open recording hands-free — even when the app is minimized.
          </Text>

          <Pressable
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={() => void onEnable()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Enable Hey Think Tap</Text>
            )}
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={() => void onSkip()} disabled={busy}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: spacing.containerMargin,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: spacing.stackLg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.secondary,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.onBackground,
    marginBottom: 10,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackLg,
  },
  primaryBtn: {
    backgroundColor: colors.secondary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryText: {
    fontFamily: fonts.bodySemi,
    color: '#fff',
    fontSize: 15,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.label,
    color: colors.onSurfaceVariant,
    fontSize: 14,
  },
  disabled: { opacity: 0.7 },
});
