import { useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguagePickerModal } from '@/src/components/LanguagePickerModal';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { SpeechLocalePickerModal } from '@/src/components/SpeechLocalePickerModal';
import { SubscribeModal } from '@/src/components/SubscribeModal';
import { Button } from '@/src/components/ui';
import { supportsAudioWithLiveTranscript } from '@/src/features/capture/captureMode';
import { getSpeechLocale } from '@/src/features/languageTranscript/locales';
import { getLanguage } from '@/src/i18n/languages';
import { useAuthStore } from '@/src/store/authStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const saveAudio = useSettingsStore((s) => s.saveAudioRecording);
  const setSaveAudioRecording = useSettingsStore((s) => s.setSaveAudioRecording);
  const tx = useSettingsStore((s) => s.tx);
  const language = getLanguage(languageCode);
  const speechLang = getSpeechLocale(speechLocale);
  const subscription = useSubscriptionStore((s) => s.profile);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeAvailable = useWakeWordStore((s) => s.available);
  const wakeListening = useWakeWordStore((s) => s.listening);
  const wakeLastHeard = useWakeWordStore((s) => s.lastHeard);
  const setWakeEnabled = useWakeWordStore((s) => s.setEnabled);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [speechPickerOpen, setSpeechPickerOpen] = useState(false);
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

        <Pressable style={styles.card} onPress={() => setPickerOpen(true)}>
          <Text style={styles.label}>{tx('appLanguage')}</Text>
          <View style={styles.langRow}>
            <Text style={styles.flag}>{language.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>{language.name}</Text>
              <Text style={styles.meta}>{language.nativeName}</Text>
            </View>
            <Text style={styles.change}>›</Text>
          </View>
          <Text style={styles.hint}>{tx('appLanguageHint')}</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => setSpeechPickerOpen(true)}>
          <Text style={styles.label}>{tx('transcriptionLanguage')}</Text>
          <View style={styles.langRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>{speechLang.name}</Text>
              <Text style={styles.meta}>{speechLang.nativeName}</Text>
            </View>
            <View style={[styles.modePill, styles.modeLive]}>
              <Text style={styles.modePillText}>OS · Device</Text>
            </View>
            <Text style={styles.change}>›</Text>
          </View>
          <Text style={styles.hint}>{tx('transcriptionLanguageHint')}</Text>
        </Pressable>

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
              ? 'Uses a quiet background listener for “Hey Think Tap”. This keeps the mic on, so it can use more battery — turn it off when you don’t need it. Notification should stay silent.'
              : 'When on (app open in the foreground), say “Hey Think Tap” or “start recording” to begin a capture.'}
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
            <View style={styles.wakeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Save audio recording</Text>
                <Text style={styles.value}>Keep the voice file for playback</Text>
              </View>
              <Switch
                value={saveAudio}
                onValueChange={(v) => void setSaveAudioRecording(v)}
                trackColor={{ false: colors.outlineVariant, true: colors.secondary }}
                thumbColor={colors.surfaceContainerLowest}
              />
            </View>
            <Text style={styles.hint}>
              {saveAudio
                ? 'Your voice is saved and transcribed after you tap Stop, which gives more accurate transcripts. Live text and spoken “pause”/“stop” are off while recording, because this Android version gives the mic to one app at a time.'
                : 'Live text appears while you speak and spoken “pause”/“stop” work, but no audio file is kept. This Android version cannot do both at once.'}
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

      <LanguagePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <SpeechLocalePickerModal
        visible={speechPickerOpen}
        onClose={() => setSpeechPickerOpen(false)}
      />
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
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  flag: { fontSize: 28 },
  change: {
    fontSize: 28,
    color: colors.secondary,
    lineHeight: 28,
  },
  hint: {
    marginTop: 10,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  modeLive: { backgroundColor: colors.successSoft },
  modePillText: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.success,
  },
});
