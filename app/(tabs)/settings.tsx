import { useState } from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SubscribeModal } from "@/src/components/SubscribeModal";
import { Button } from "@/src/components/ui";
import { SHOW_DIAGNOSTICS } from "@/src/config/features";
import { supportsAudioWithLiveTranscript } from "@/src/features/capture/captureMode";
import { buildReport, clearLogs, logCount } from "@/src/services/diagnostics";
import { queueSize } from "@/src/services/transcriptionQueue";
import { useAuthStore } from "@/src/store/authStore";
import { useSettingsStore } from "@/src/store/settingsStore";
import { useSubscriptionStore } from "@/src/store/subscriptionStore";
import { useWakeWordStore } from "@/src/store/wakeWordStore";
import { colors, fonts, radii, spacing, typography } from "@/src/theme/tokens";
import { AndroidWakeWord } from "android-wake-word";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.session?.user);
  const tx = useSettingsStore((s) => s.tx);
  const subscription = useSubscriptionStore((s) => s.profile);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeAvailable = useWakeWordStore((s) => s.available);
  const wakeListening = useWakeWordStore((s) => s.listening);
  const wakeLastHeard = useWakeWordStore((s) => s.lastHeard);
  const setWakeEnabled = useWakeWordStore((s) => s.setEnabled);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  /**
   * WHY this exists: issues are reported from devices the developer does not
   * have, and a tester cannot run adb logcat. This puts the same detail into
   * the share sheet so it can be sent from the phone itself.
   */
  const onShareDiagnostics = async () => {
    let pending = 0;
    try {
      pending = await queueSize();
    } catch {
      // ignore
    }
    const report = buildReport({
      wakeEnabled,
      wakeAvailable,
      wakeListening,
      lastHeard: wakeLastHeard ?? "(none)",
      serviceListening: AndroidWakeWord.isListening(),
      serviceRecording: AndroidWakeWord.isRecording(),
      modelReady: AndroidWakeWord.isModelReady(),
      micPermission: AndroidWakeWord.hasMicPermission(),
      commandsEnabled: AndroidWakeWord.areCommandsEnabled(),
      pendingTranscriptions: pending,
      appLanguage: useSettingsStore.getState().languageCode,
      speechLocale: useSettingsStore.getState().speechLocale,
    });
    try {
      await Share.share({ message: report, title: "ThinkTap diagnostics" });
    } catch (e) {
      Alert.alert(
        "Could not share",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const onToggleWake = async (enabled: boolean) => {
    if (!enabled) {
      await setWakeEnabled(false);
      return;
    }
    if (Platform.OS === "android") {
      const mic = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (mic !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          "Permission needed",
          "Microphone access is required for Hey Think Tap.",
        );
        return;
      }
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
    }
    await setWakeEnabled(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          // Generous bottom padding so the last card (app version) always
          // clears the on-screen nav bar / gesture area, even on devices that
          // under-report insets.bottom. edges now includes 'bottom' so the
          // SafeAreaView frame itself also respects the nav area.
          { paddingBottom: 64 + Math.max(insets.bottom, 24) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title={tx("settings")} subtitle={tx("profile")} />

        <View style={[styles.card, styles.cardAccent]}>
          <Text style={styles.label}>{tx("profile")}</Text>
          <Text style={styles.value}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={styles.meta}>Local guest mode — no login required</Text>
          {subscription ? (
            <View style={styles.trialPill}>
              <Text style={styles.trialPillText}>{tx("freeTrialActive")}</Text>
            </View>
          ) : null}
          <View style={styles.subscribeWrap}>
            <Button
              title={subscription ? tx("updateSubscription") : tx("subscribe")}
              onPress={() => setSubscribeOpen(true)}
              variant={subscription ? "secondary" : "primary"}
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
              trackColor={{
                false: colors.outlineVariant,
                true: colors.secondary,
              }}
              thumbColor={colors.surfaceContainerLowest}
            />
          </View>
          <Text style={styles.hint}>
            Think Tap listens only while the app is open. Leaving the app
            releases the microphone and pauses any recording — your audio is
            kept, and you continue with Resume or by saying “Hey Think Tap
            resume” when you come back.
            {wakeEnabled
              ? wakeAvailable === false
                ? " Speech recognition is unavailable on this device/build."
                : wakeListening
                  ? " Listening…"
                  : " Enabled."
              : ""}
          </Text>
          {wakeEnabled && wakeLastHeard ? (
            <Text style={styles.hint}>Last heard: “{wakeLastHeard}”</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Voice commands</Text>
          <Text style={styles.hint}>
            Every command needs the action word. Saying only “Hey Think Tap”
            does nothing.
          </Text>
          <View style={styles.cmdList}>
            <Text style={styles.cmdRow}>
              <Text style={styles.cmd}>“Hey Think Tap start”</Text>
              {"  "}begin recording
            </Text>
            <Text style={styles.cmdRow}>
              <Text style={styles.cmd}>“Hey Think Tap stop”</Text>
              {"  "}finish and save
            </Text>
            <Text style={styles.cmdRow}>
              <Text style={styles.cmd}>“Hey Think Tap pause”</Text>
              {"  "}pause
            </Text>
            <Text style={styles.cmdRow}>
              <Text style={styles.cmd}>“Hey Think Tap resume”</Text>
              {"  "}continue
            </Text>
          </View>
          <Text style={styles.hint}>
            While recording, the name is required — so saying “stop” in the
            middle of your idea will not end the take.
          </Text>
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

        {SHOW_DIAGNOSTICS ? (
          <View style={styles.card}>
            <Text style={styles.label}>Diagnostics</Text>
            <Text style={styles.value}>Share a report with the developer</Text>
            <Text style={styles.hint}>
              Includes recent warnings and device state. Use this when reporting
              a problem. No recordings or transcripts are included.
            </Text>
            <View style={styles.subscribeWrap}>
              <Button
                title="Share diagnostics"
                onPress={() => void onShareDiagnostics()}
              />
            </View>
            <Pressable
              onPress={() => {
                clearLogs();
                Alert.alert("Cleared", "Diagnostic log cleared.");
              }}
            >
              <Text style={[styles.hint, { textDecorationLine: "underline" }]}>
                Clear log ({logCount()} entries)
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>{tx("appVersion")}</Text>
          <Text style={styles.meta}>1.0.0 · MVP</Text>
        </View>
      </ScrollView>

      <SubscribeModal
        visible={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cmdList: { gap: 8, marginTop: 4, marginBottom: 12 },
  cmdRow: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  cmd: { fontFamily: fonts.bodySemi, color: colors.onSurface },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.containerMargin, gap: spacing.stackMd },
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
    alignSelf: "flex-start",
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
    flexDirection: "row",
    alignItems: "center",
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
