import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextField } from '@/src/components/ui';
import { APP_LANGUAGES, type AppLanguageCode } from '@/src/i18n/languages';
import { useAuthStore } from '@/src/store/authStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import {
  type ProfessionType,
  useSubscriptionStore,
} from '@/src/store/subscriptionStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SubscribeModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.session?.user);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const startFreeTrial = useSubscriptionStore((s) => s.startFreeTrial);
  const existing = useSubscriptionStore((s) => s.profile);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [profession, setProfession] = useState<ProfessionType | null>(null);
  const [language, setLanguage] = useState<AppLanguageCode>(languageCode);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setName(existing.name);
      setEmail(existing.email);
      setContact(existing.contact);
      setProfession(existing.profession);
      setLanguage(existing.language);
    } else {
      const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
      setName(fullName === 'Think Tap' ? '' : fullName);
      setEmail(user?.email?.includes('guest@') ? '' : (user?.email ?? ''));
      setContact('');
      setProfession(null);
      setLanguage(languageCode);
    }
    setFieldErrors({});
  }, [visible, existing, user, languageCode]);

  const onSubmit = async () => {
    if (!profession) {
      setFieldErrors({ profession: tx('professionRequired') });
      return;
    }
    setLoading(true);
    setFieldErrors({});
    const result = await startFreeTrial({ name, email, contact, profession, language });
    setLoading(false);
    if (!result.ok) {
      if (result.field) setFieldErrors({ [result.field]: result.error });
      return;
    }
    Alert.alert(tx('freeTrial'), tx('freeTrialStarted'));
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{tx('subscribe')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.primary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.planCard}>
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>{tx('freeTrial')}</Text>
              </View>
              <Text style={styles.planTitle}>{tx('freeTrialPlan')}</Text>
              <Text style={styles.planMeta}>{tx('freeTrialDesc')}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>• {tx('freeTrialFeature1')}</Text>
                <Text style={styles.planFeature}>• {tx('freeTrialFeature2')}</Text>
                <Text style={styles.planFeature}>• {tx('freeTrialFeature3')}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>{tx('basicInfo')}</Text>

            <TextField
              label={tx('fullName')}
              value={name}
              onChangeText={setName}
              error={fieldErrors.name}
              autoCapitalize="words"
            />
            <TextField
              label={tx('email')}
              value={email}
              onChangeText={setEmail}
              error={fieldErrors.email}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextField
              label={tx('contact')}
              value={contact}
              onChangeText={setContact}
              error={fieldErrors.contact}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>{tx('profession')}</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setProfession('businessman')}
                style={[styles.chip, profession === 'businessman' && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, profession === 'businessman' && styles.chipTextActive]}
                >
                  {tx('businessman')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setProfession('working_professional')}
                style={[
                  styles.chip,
                  profession === 'working_professional' && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    profession === 'working_professional' && styles.chipTextActive,
                  ]}
                >
                  {tx('workingProfessional')}
                </Text>
              </Pressable>
            </View>
            {fieldErrors.profession ? (
              <Text style={styles.error}>{fieldErrors.profession}</Text>
            ) : null}

            <Text style={[styles.fieldLabel, { marginTop: spacing.stackMd }]}>
              {tx('language')}
            </Text>
            <View style={styles.langGrid}>
              {APP_LANGUAGES.map((lang) => {
                const active = language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => setLanguage(lang.code)}
                    style={[styles.langChip, active && styles.langChipActive]}
                  >
                    <Text style={styles.langFlag}>{lang.flag}</Text>
                    <Text style={[styles.langName, active && styles.langNameActive]}>
                      {lang.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: spacing.stackLg }}>
              <Button
                title={
                  loading
                    ? tx('startingTrial')
                    : existing
                      ? tx('updateSubscription')
                      : tx('startFreeTrial')
                }
                onPress={() => void onSubmit()}
                disabled={loading}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '92%',
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
  scroll: { paddingBottom: 24 },
  planCard: {
    backgroundColor: colors.secondaryFixed,
    borderRadius: radii.xl,
    padding: spacing.stackMd,
    borderWidth: 1,
    borderColor: colors.secondary,
    marginBottom: spacing.stackMd,
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
    marginBottom: 8,
  },
  planBadgeText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.onPrimary,
  },
  planTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  planMeta: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
  planFeatures: { marginTop: 12, gap: 4 },
  planFeature: {
    fontFamily: fonts.bodyMedium,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSecondaryFixedVariant,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.bodyMd.fontSize,
    color: colors.primary,
    marginBottom: spacing.stackMd,
  },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  chipActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondaryFixed,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  chipTextActive: { color: colors.onSecondaryFixedVariant },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  langChipActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondaryFixed,
  },
  langFlag: { fontSize: 16 },
  langName: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
  langNameActive: { color: colors.onSecondaryFixedVariant },
  error: {
    marginTop: 6,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.error,
  },
});
