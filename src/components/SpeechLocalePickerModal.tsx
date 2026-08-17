import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  INDIAN_SPEECH_LOCALES,
  type LocaleAvailability,
  type SpeechLocaleCode,
} from '@/src/features/languageTranscript/locales';
import {
  getIndianLocaleAvailability,
  triggerOfflineModelDownload,
} from '@/src/services/languageTranscriptService';
import { useSettingsStore } from '@/src/store/settingsStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SpeechLocalePickerModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const setSpeechLocale = useSettingsStore((s) => s.setSpeechLocale);
  const tx = useSettingsStore((s) => s.tx);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState<LocaleAvailability[] | null>(null);
  const [loadingSupport, setLoadingSupport] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingSupport(true);
    void (async () => {
      try {
        const list = await getIndianLocaleAvailability();
        if (!cancelled) setAvailability(list);
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setLoadingSupport(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const onSelect = async (code: SpeechLocaleCode) => {
    if (saving) return;
    setSaving(true);
    try {
      await setSpeechLocale(code);
      Alert.alert(tx('transcriptionLanguage'), tx('speechLocaleSaved'));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const onDownload = async (code: SpeechLocaleCode) => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        tx('transcriptionLanguage'),
        'Offline speech packs are managed in iOS Settings → General → Keyboard → Dictation.',
      );
      return;
    }
    try {
      await triggerOfflineModelDownload(code);
      Alert.alert(tx('transcriptionLanguage'), 'Follow the system dialog to download the speech pack.');
      const list = await getIndianLocaleAvailability();
      setAvailability(list);
    } catch (e) {
      Alert.alert(
        tx('transcriptionLanguage'),
        e instanceof Error ? e.message : 'Could not start offline model download.',
      );
    }
  };

  const badgeFor = (code: SpeechLocaleCode) => {
    const row = availability?.find((a) => a.code === code);
    if (!row) return null;
    if (row.installedOnDevice) return 'On-device';
    if (row.supportedOnDevice) return 'Downloadable';
    if (row.available) return 'Available';
    return 'May be limited';
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{tx('transcriptionLanguage')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={styles.sheetHint}>{tx('transcriptionLanguageHint')}</Text>
          {loadingSupport ? (
            <ActivityIndicator color={colors.primary} style={{ marginBottom: 12 }} />
          ) : null}

          <FlatList
            data={INDIAN_SPEECH_LOCALES}
            keyExtractor={(item) => item.code}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => {
              const active = item.code === speechLocale;
              const badge = badgeFor(item.code);
              const row = availability?.find((a) => a.code === item.code);
              return (
                <Pressable
                  onPress={() => void onSelect(item.code)}
                  onLongPress={() => void onDownload(item.code)}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.native}>{item.nativeName}</Text>
                    {badge ? <Text style={styles.badge}>{badge}</Text> : null}
                  </View>
                  {row?.supportedOnDevice && !row.installedOnDevice ? (
                    <Pressable
                      onPress={() => void onDownload(item.code)}
                      hitSlop={8}
                      style={styles.downloadBtn}
                    >
                      <Ionicons name="download-outline" size={18} color={colors.secondary} />
                    </Pressable>
                  ) : null}
                  {active ? (
                    <View style={styles.selectedPill}>
                      <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                      <Text style={styles.selectedText}>{tx('selected')}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(21,28,39,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: spacing.containerMargin,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  sheetHint: {
    fontFamily: fonts.body,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackMd,
  },
  list: { paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  rowActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondaryFixed,
  },
  name: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.bodyMd.fontSize,
    color: colors.primary,
  },
  native: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  badge: {
    marginTop: 4,
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.secondary,
  },
  downloadBtn: {
    padding: 6,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  selectedText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.onPrimary,
  },
});
