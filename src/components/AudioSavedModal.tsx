import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Shown under the main message while AI/organize still runs. */
  organizing?: boolean;
};

export function AudioSavedModal({ visible, onClose, organizing = false }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={32} color={colors.success} />
          </View>

          <Text style={styles.title}>Audio saved</Text>
          <Text style={styles.body}>
            Your recording has been successfully saved.
          </Text>
          {organizing ? (
            <Text style={styles.meta}>Organizing your idea in the background…</Text>
          ) : (
            <Text style={styles.meta}>It will appear in Ideas when ready.</Text>
          )}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMargin,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.card,
    paddingHorizontal: spacing.stackLg,
    paddingTop: spacing.stackLg,
    paddingBottom: spacing.stackMd,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.stackMd,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    lineHeight: typography.titleMd.lineHeight,
    color: colors.primary,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.stackSm,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  meta: {
    marginTop: spacing.stackSm,
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    lineHeight: typography.labelMd.lineHeight,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.stackLg,
    alignSelf: 'stretch',
    backgroundColor: colors.secondary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonText: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onPrimary,
  },
});
