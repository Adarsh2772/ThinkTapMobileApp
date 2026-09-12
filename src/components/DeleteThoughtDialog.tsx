import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteThoughtDialog({ visible, title, onCancel, onConfirm }: Props) {
  const label = title.replace(/\s+/g, ' ').trim() || 'Untitled thought';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.heading}>Delete this thought?</Text>
          <Text style={styles.body}>
            "{label}" will be permanently removed from My Thoughts. This cannot be undone.
          </Text>
          <View style={styles.row}>
            <Pressable onPress={onCancel} style={[styles.btn, styles.keepBtn]}>
              <Text style={styles.keepText}>Keep thought</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.btn, styles.deleteBtn]}>
              <Text style={styles.deleteText}>Delete thought</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.containerMargin,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.card,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heading: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
    marginBottom: 10,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
    color: colors.onSurface,
    marginBottom: 20,
  },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  keepBtn: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keepText: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  deleteBtn: {
    backgroundColor: colors.error,
  },
  deleteText: {
    fontFamily: fonts.bodySemi,
    color: colors.onPrimary,
  },
});

