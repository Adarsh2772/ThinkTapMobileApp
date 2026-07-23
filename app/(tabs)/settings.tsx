import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguagePickerModal } from '@/src/components/LanguagePickerModal';
import { Button, TextField } from '@/src/components/ui';
import { getLanguage } from '@/src/i18n/languages';
import { useAiConfigStore } from '@/src/store/aiConfigStore';
import { useAuthStore } from '@/src/store/authStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const signOut = useAuthStore((s) => s.signOut);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const language = getLanguage(languageCode);
  const apiKey = useAiConfigStore((s) => s.apiKey);
  const setApiKey = useAiConfigStore((s) => s.setApiKey);
  const mode = apiKey ? 'live' : 'demo';
  const providerLabel = apiKey?.startsWith('gsk_')
    ? 'Groq'
    : apiKey?.startsWith('sk-')
      ? 'OpenAI'
      : null;
  const router = useRouter();
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeAvailable = useWakeWordStore((s) => s.available);
  const wakeListening = useWakeWordStore((s) => s.listening);
  const setWakeEnabled = useWakeWordStore((s) => s.setEnabled);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const onSignOut = () => {
    Alert.alert(tx('signOut'), tx('signOutConfirm'), [
      { text: tx('cancel'), style: 'cancel' },
      {
        text: tx('signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const onSaveKey = async () => {
    setSavingKey(true);
    try {
      await setApiKey(keyDraft.trim() || null);
      setShowKeyEditor(false);
      setKeyDraft('');
      Alert.alert(
        'Speech-to-text',
        keyDraft.trim()
          ? 'Live transcription enabled (Groq or OpenAI). New recordings will convert your speech to text.'
          : 'API key removed. App will use demo transcript text.',
      );
    } finally {
      setSavingKey(false);
    }
  };

  const onClearKey = () => {
    Alert.alert('Remove API key?', 'Transcription will switch back to demo mode.', [
      { text: tx('cancel'), style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await setApiKey(null);
          setKeyDraft('');
          setShowKeyEditor(false);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{tx('settings')}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{tx('profile')}</Text>
          <Text style={styles.value}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.meta}>{user?.email}</Text>
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

        <View style={styles.card}>
          <Text style={styles.label}>Speech-to-text</Text>
          <View style={styles.modeRow}>
            <View style={[styles.modePill, mode === 'live' ? styles.modeLive : styles.modeDemo]}>
              <Text style={styles.modePillText}>
                {mode === 'live'
                  ? `Live · ${providerLabel ?? 'API'}`
                  : 'Demo mode'}
              </Text>
            </View>
          </View>
          <Text style={styles.hint}>
            {mode === 'live'
              ? `Live STT via ${providerLabel} (whisper-large-v3). Set App Language to match the language you speak. Speak clearly, 1–2 feet from the mic.`
              : 'Add a Groq key (gsk_…) for free testing, or an OpenAI key (sk-…). Without a key, sample demo text is used.'}
          </Text>

          {apiKey ? (
            <Text style={styles.keyMasked}>
              Key saved: {apiKey.slice(0, 4)}…{apiKey.slice(-4)}
            </Text>
          ) : null}

          {!showKeyEditor ? (
            <View style={styles.keyActions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  setShowKeyEditor(true);
                  setKeyDraft('');
                }}
              >
                <Text style={styles.secondaryBtnText}>
                  {apiKey ? 'Update API key' : 'Add Groq / OpenAI API key'}
                </Text>
              </Pressable>
              {apiKey ? (
                <Pressable onPress={onClearKey}>
                  <Text style={styles.removeLink}>Remove key</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.keyEditor}>
              <TextField
                label="API key (Groq gsk_… or OpenAI sk-…)"
                value={keyDraft}
                onChangeText={setKeyDraft}
                placeholder="gsk_... or sk-..."
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <Button
                title={savingKey ? 'Saving…' : 'Save & enable live STT'}
                onPress={() => void onSaveKey()}
                disabled={savingKey}
              />
              <Pressable onPress={() => setShowKeyEditor(false)} style={{ marginTop: 8 }}>
                <Text style={styles.removeLink}>{tx('cancel')}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.wakeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Hey Think Tap</Text>
              <Text style={styles.value}>Wake word</Text>
            </View>
            <Switch
              value={wakeEnabled}
              onValueChange={(v) => void setWakeEnabled(v)}
              trackColor={{ false: colors.outlineVariant, true: colors.secondary }}
              thumbColor={colors.surfaceContainerLowest}
            />
          </View>
          <Text style={styles.hint}>
            When on (and the app is open in the foreground), say “Hey Think Tap” or “start
            recording” to begin a capture. Best with a development build — may be limited in Expo
            Go.
            {wakeEnabled
              ? wakeAvailable === false
                ? ' Speech recognition is unavailable on this device/build.'
                : wakeListening
                  ? ' Listening…'
                  : ' Enabled.'
              : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{tx('comingSoon')}</Text>
          <Text style={styles.meta}>Biometrics · pocket / screen-off wake word</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{tx('appVersion')}</Text>
          <Text style={styles.meta}>1.0.0 · MVP</Text>
        </View>

        <Button title={tx('signOut')} variant="secondary" onPress={onSignOut} />
      </ScrollView>

      <LanguagePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.containerMargin, gap: spacing.stackMd, paddingBottom: 40 },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    color: colors.onBackground,
    marginBottom: spacing.stackMd,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.xl,
    padding: spacing.stackMd,
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
    color: colors.onSurfaceVariant,
    lineHeight: 28,
  },
  hint: {
    marginTop: 10,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  modeRow: { flexDirection: 'row', marginTop: 4 },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  modeLive: { backgroundColor: '#DCFCE7' },
  modeDemo: { backgroundColor: colors.surfaceVariant },
  modePillText: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.primary,
  },
  keyMasked: {
    marginTop: 10,
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  keyActions: { marginTop: 12, gap: 10 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.primary,
  },
  removeLink: {
    fontFamily: fonts.label,
    fontSize: 13,
    color: colors.secondary,
    textAlign: 'center',
  },
  keyEditor: { marginTop: 12 },
});
