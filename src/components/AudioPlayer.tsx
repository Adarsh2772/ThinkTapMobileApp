import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createElement, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { normalizeFileUri } from '@/src/services/audioStorage';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import { formatClock } from '@/src/utils/format';

type Props = {
  uri: string;
  durationSec: number;
};

export function AudioPlayer({ uri, durationSec }: Props) {
  const sourceUri = useMemo(() => (uri ? normalizeFileUri(uri) : ''), [uri]);
  const player = useAudioPlayer(sourceUri || null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlayError(null);

    (async () => {
      if (!sourceUri || Platform.OS === 'web') return;
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
        if (!cancelled) {
          player.replace(sourceUri);
        }
      } catch {
        // play() will surface errors
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
    if (busy) return;
    if (!sourceUri) {
      setPlayError('No audio file was saved for this thought.');
      return;
    }
    setBusy(true);
    setPlayError(null);
    try {
      if (Platform.OS !== 'web') {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });
      }

      if (playing) {
        player.pause();
        return;
      }

      const duration = status.duration || 0;
      if (duration > 0 && status.currentTime >= Math.max(0, duration - 0.25)) {
        await player.seekTo(0);
      }

      player.play();
    } catch (e) {
      setPlayError(
        e instanceof Error ? e.message : 'Could not play this recording. Try recording a new thought.',
      );
    } finally {
      setBusy(false);
    }
  };

  const skip = async (delta: number) => {
    const next = Math.max(0, Math.min(totalSec, positionSec + delta));
    await player.seekTo(next);
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Voice Recording</Text>
        {sourceUri ? (
          createElement('audio', {
            src: sourceUri,
            controls: true,
            preload: 'auto',
            style: { width: '100%', marginTop: 12 },
          })
        ) : (
          <Text style={styles.meta}>
            No audio file was saved for this thought. Record a new one to play it back.
          </Text>
        )}
      </View>
    );
  }

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
            {sourceUri
              ? `${formatClock(positionSec)} / ${formatClock(totalSec)}`
              : 'No audio file saved'}
          </Text>
        </View>
      </View>

      <View style={styles.waveTrack}>
        <View style={[styles.waveFill, { width: `${progress * 100}%` }]} />
      </View>

      {playError ? <Text style={styles.error}>{playError}</Text> : null}

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
    marginTop: 8,
  },
  error: {
    marginTop: 10,
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.error,
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
