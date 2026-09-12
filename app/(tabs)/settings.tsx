import { useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/ScreenHeader';
import { SubscribeModal } from '@/src/components/SubscribeModal';
import { Button } from '@/src/components/ui';
import { supportsAudioWithLiveTranscript } from '@/src/features/capture/captureMode';
import { useAuthStore } from '@/src/store/authStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const tx = useSettingsStore((s) => s.tx);
  const subscription = useSubscriptionStore((s) => s.profile);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeAvailable = useWakeWordStore((s) => s.available);
  const wakeListening = useWakeWordStore((s) => s.listening);
  const wakeLastHeard = useWakeWordStore((s) => s.lastHeard);
  const setWakeEnabled = useWakeWordStore((s) => s.setEnabled);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  const onToggleWake = async (enabled: boolean) => {
    if (!enabled) {
      await setWakeEnabled(false);
      return;
    }
    if (Platform.OS === 'android') {
      const mic = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (mic !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permission needed', 'Microphone access is required for Hey Think Tap.');
        return;
      }
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
    }
    await setWakeEnabled(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={tx('settings')} subtitle={tx('profile')} />

        <View style={[styles.card, styles.cardAccent]}>
          <Text style={styles.label}>{tx('profile')}</Text>
          <Text style={styles.value}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.meta}>Local guest mode — no login required</Text>
          {subscription ? (
            <View style={styles.trialPill}>
              <Text style={styles.trialPillText}>{tx('freeTrialActive')}</Text>
            </View>
          ) : null}
          <View style={styles.subscribeWrap}>
            <Button
              title={subscription ? tx('updateSubscription') : tx('subscribe')}
              onPress={() => setSubscribeOpen(true)}
              variant={subscription ? 'secondary' : 'primary'}
            />
          </View>
        </View>

        {/* App Language + Live preview language temporarily hidden from Settings */}

        <View style={styles.card}>
          <View style={styles.wakeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Hey Think Tap</Text>
              <Text style={styles.value}>Wake word</Text>
            </View>
            <Switch
              value={wakeEnabled}
              onValueChange={(v) => void onToggleWake(v)}
              trackColor={{ false: colors.outlineVariant, true: colors.secondary }}
              thumbColor={colors.surfaceContainerLowest}
            />
          </View>
          <Text style={styles.hint}>
            {Platform.OS === 'android'
              ? 'Say “Hey Think Tap” or “start recording” to begin, and “stop recording” to finish — including when the app is minimized. Listening stays quiet (no beep or vibration). You’ll see “Recording started” / “Recording stopped” on screen. Turn this off when you don’t need it to save battery.'
              : 'When on (app open in the foreground), say “Hey Think Tap” or “start recording” to begin a capture. Confirmation is on-screen only — no sound or vibration.'}
            {wakeEnabled
              ? wakeAvailable === false
                ? ' Speech recognition is unavailable on this device/build.'
                : wakeListening
                  ? ' Listening…'
                  : ' Enabled.'
              : ''}
          </Text>
          {wakeEnabled && wakeLastHeard ? (
            <Text style={styles.hint}>Last heard: “{wakeLastHeard}”</Text>
          ) : null}
        </View>

        {!supportsAudioWithLiveTranscript() ? (
          <View style={styles.card}>
            <Text style={styles.label}>Save audio recording</Text>
            <Text style={styles.value}>Always on for this Android version</Text>
            <Text style={styles.hint}>
              This phone cannot share the microphone between live captions and a
              saved voice file. Think Tap records the file so your idea is kept
              after Stop. Transcripts are added once the network is available.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>{tx('comingSoon')}</Text>
          <Text style={styles.meta}>Biometrics · iOS always-on wake word</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{tx('appVersion')}</Text>
          <Text style={styles.meta}>1.0.0 · MVP</Text>
        </View>
      </ScrollView>

      <SubscribeModal visible={subscribeOpen} onClose={() => setSubscribeOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.containerMargin, gap: spacing.stackMd, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.stackMd,
  },
  cardAccent: {
    backgroundColor: colors.secondarySoft,
    borderColor: colors.secondaryFixed,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  value: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.bodyMd.fontSize,
    color: colors.primary,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  subscribeWrap: { marginTop: spacing.stackMd },
  trialPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  trialPillText: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.success,
  },
  wakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hint: {
    marginTop: 10,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
