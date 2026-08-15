import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { normalizeFileUri } from '@/src/services/audioStorage';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import { formatClock } from '@/src/utils/format';

type Props = {
  uri: string;
  durationSec: number;
};

export function AudioPlayer({ uri, durationSec }: Props) {
  const sourceUri = useMemo(() => normalizeFileUri(uri), [uri]);
  const player = useAudioPlayer(sourceUri || null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!sourceUri) return;
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        if (!cancelled) {
          player.replace(sourceUri);
        }
      } catch {
        // ignore — play() will surface errors
      }
    })();

    return () => {
      cancelled = true;
      try {
        player.pause();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUri]);

  const playing = status.playing;
  const positionSec = Math.floor(status.currentTime || 0);
  const totalSec = Math.max(durationSec, Math.floor(status.duration || 0), 1);
  const progress = Math.min(1, positionSec / totalSec);

  const toggle = async () => {
    if (busy || !sourceUri) return;
    setBusy(true);
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });

      player.replace(sourceUri);

      if (playing) {
        player.pause();
        return;
      }

      if (
        status.duration > 0 &&
        status.currentTime >= Math.max(0, status.duration - 0.25)
      ) {
        await player.seekTo(0);
      }

      player.play();
    } catch (e) {
      Alert.alert(
        'Playback failed',
        e instanceof Error
          ? e.message
          : 'Could not play this recording. Try recording a new idea.',
      );
    } finally {
      setBusy(false);
    }
  };

  const skip = async (delta: number) => {
    const next = Math.max(0, Math.min(totalSec, positionSec + delta));
    await player.seekTo(next);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable
          onPress={() => void toggle()}
          style={[styles.playBtn, busy && styles.playBtnDisabled]}
          accessibilityRole="button"
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={24}
            color={colors.onPrimary}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Voice Recording</Text>
          <Text style={styles.meta}>
            {formatClock(positionSec)} / {formatClock(totalSec)}
          </Text>
        </View>
      </View>

      <View style={styles.waveTrack}>
        <View style={[styles.waveFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.skipRow}>
        <Pressable onPress={() => void skip(-10)} hitSlop={8}>
          <Text style={styles.skip}>↺ 10s</Text>
        </Pressable>
        <Pressable onPress={() => void skip(10)} hitSlop={8}>
          <Text style={styles.skip}>10s ↻</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.stackMd },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnDisabled: { opacity: 0.6 },
  title: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.labelMd.fontSize,
    color: colors.primary,
  },
  meta: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  waveTrack: {
    height: 4,
    backgroundColor: colors.surfaceVariant,
    borderRadius: radii.full,
    marginTop: spacing.stackMd,
    overflow: 'hidden',
  },
  waveFill: {
    height: '100%',
    backgroundColor: colors.secondary,
  },
  skipRow: {
    marginTop: spacing.stackMd,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skip: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
});
