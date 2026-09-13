import AsyncStorage from '@react-native-async-storage/async-storage';
import { AndroidWakeWord } from 'android-wake-word';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

/**
 * One-time battery setup prompt.
 *
 * WHY this exists: a microphone foreground service is killed by default on most
 * Android phones, and hardest on OPPO, Vivo, Xiaomi and Realme. The fix is a
 * device setting - and asking users to find it themselves does not work. They
 * conclude the app is broken and stop using it, usually without reporting
 * anything. The OPPO A51 failure reported during testing was exactly this class
 * of problem.
 *
 * So the app checks the setting itself and offers to open the right screen:
 *
 *   Step 1 - battery optimisation: standard system dialog, one tap
 *   Step 2 - OEM autostart: no API exists, but the screen can be opened
 *            directly so the user is one toggle away instead of hunting
 *
 * Shown once, skippable, and re-openable from Settings. Nothing is changed
 * silently - Android does not permit that, and it would be wrong if it did.
 */

const SEEN_KEY = '@thinktap/battery_setup_seen';

export function useBatterySetupNeeded(): {
  needed: boolean;
  markSeen: () => Promise<void>;
} {
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void (async () => {
      const seen = await AsyncStorage.getItem(SEEN_KEY);
      if (seen === 'true') return;
      // Only interrupt when there is something to fix.
      const optimized = AndroidWakeWord.isBatteryOptimized();
      const aggressive = AndroidWakeWord.isAggressiveOem();
      if (optimized || aggressive) setNeeded(true);
    })();
  }, []);

  const markSeen = async () => {
    await AsyncStorage.setItem(SEEN_KEY, 'true');
    setNeeded(false);
  };

  return { needed, markSeen };
}

/** Re-open from Settings. */
export async function resetBatterySetupPrompt(): Promise<void> {
  await AsyncStorage.removeItem(SEEN_KEY);
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BatterySetupModal({ visible, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [batteryDone, setBatteryDone] = useState(false);

  const oem = AndroidWakeWord.oemName();
  const aggressive = AndroidWakeWord.isAggressiveOem();

  // Re-check when the user returns from the system screen.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      if (!AndroidWakeWord.isBatteryOptimized()) setBatteryDone(true);
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  const onAllowBattery = async () => {
    await AndroidWakeWord.requestIgnoreBatteryOptimizations();
  };

  const onOpenAutostart = async () => {
    await AndroidWakeWord.openAutostartSettings();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Keep recordings working</Text>

          {step === 1 ? (
            <>
              <Text style={styles.body}>
                Android stops apps from using the microphone in the background to
                save battery. Without this, Think Tap can stop recording partway
                through your idea.
              </Text>
              <Text style={styles.hint}>
                Tap below and choose <Text style={styles.bold}>Allow</Text> on the
                dialog that appears.
              </Text>

              {batteryDone ? (
                <View style={styles.donePill}>
                  <Text style={styles.doneText}>Done — background use allowed</Text>
                </View>
              ) : (
                <View style={styles.action}>
                  <Button title="Allow background use" onPress={() => void onAllowBattery()} />
                </View>
              )}

              <View style={styles.row}>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.skip}>Skip</Text>
                </Pressable>
                <Pressable onPress={() => (aggressive ? setStep(2) : onClose())} hitSlop={8}>
                  <Text style={styles.next}>{aggressive ? 'Next' : 'Done'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.body}>
                {oem} phones also need Think Tap added to the auto-start list, or
                the system closes it while you are recording.
              </Text>
              <Text style={styles.hint}>
                Tap below, find <Text style={styles.bold}>Think Tap</Text> in the
                list, and turn it on.
              </Text>

              <View style={styles.action}>
                <Button title="Open auto-start settings" onPress={() => void onOpenAutostart()} />
              </View>

              <View style={styles.row}>
                <Pressable onPress={() => setStep(1)} hitSlop={8}>
                  <Text style={styles.skip}>Back</Text>
                </Pressable>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.next}>Done</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.containerMargin,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: 24,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    color: colors.onSurface,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
  },
  hint: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  bold: { fontFamily: fonts.bodySemi, color: colors.onSurface },
  action: { marginBottom: 16 },
  donePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
    marginBottom: 16,
  },
  doneText: { fontFamily: fonts.label, fontSize: 13, color: colors.success },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skip: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  next: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.labelMd.fontSize,
    color: colors.secondary,
  },
});
