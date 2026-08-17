import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_LANGUAGES, type AppLanguageCode } from '@/src/i18n/languages';
import { useSettingsStore } from '@/src/store/settingsStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function LanguagePickerModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const languageCode = useSettingsStore((s) => s.languageCode);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const tx = useSettingsStore((s) => s.tx);
  const [saving, setSaving] = useState(false);

  const onSelect = async (code: AppLanguageCode) => {
    if (saving) return;
    setSaving(true);
    try {
      await setLanguage(code);
      Alert.alert(tx('appLanguage'), tx('languageSaved'));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{tx('chooseLanguage')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={styles.sheetHint}>{tx('appLanguageHint')}</Text>

          <FlatList
            data={APP_LANGUAGES}
            keyExtractor={(item) => item.code}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => {
              const active = item.code === languageCode;
              return (
                <Pressable
                  onPress={() => void onSelect(item.code)}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.native}>{item.nativeName}</Text>
                  </View>
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
  flag: { fontSize: 28 },
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
