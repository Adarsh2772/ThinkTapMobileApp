import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { enrichIdeaFromDeviceTranscript } from '@/src/services/aiService';
import { analyzeTranscript } from '@/src/services/transcriptAnalysisService';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { usePendingRecordingStore } from '@/src/store/pendingRecordingStore';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';
import type { ProcessingStage, TranscriptAnalysis } from '@/src/types';
import { createId } from '@/src/utils/format';

const STAGE_COPY: Record<Exclude<ProcessingStage, 'done' | 'error'>, string> = {
  uploading: 'Saving your recording…',
  transcribing: 'Reading your transcript',
  extracting: 'Extracting key themes',
  summarizing: 'Analyzing your idea',
  saving: 'Saving your idea…',
};

export default function ProcessingScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const addIdea = useIdeasStore((s) => s.addIdea);
  const pending = usePendingRecordingStore((s) => s.pending);
  const clearPending = usePendingRecordingStore((s) => s.clearPending);
  const [stage, setStage] = useState<ProcessingStage>('uploading');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        if (!user) throw new Error('You must be signed in');
        if (!pending) {
          throw new Error('Missing recording. Go back and record again.');
        }

        const { audioUri, durationSec, transcript, speechLocale } = pending;

        if (!(transcript ?? '').trim()) {
          throw new Error('No speech detected in this recording. Try speaking more clearly.');
        }

        setStage('uploading');
        await delay(300);

        // Local title/category from OS transcript, then cloud analyze for Summary buckets.
        const enrichment = enrichIdeaFromDeviceTranscript({
          transcript,
          speechLocale,
          onStage: (s) => {
            if (s !== 'summarizing') setStage(s);
          },
        });

        setStage('summarizing');
        let analysis: TranscriptAnalysis | null = null;
        let summary = enrichment.summary;
        try {
          analysis = await analyzeTranscript(enrichment.transcript);
          summary = analysis.thought || enrichment.summary;
        } catch (analyzeError) {
          console.warn('Transcript analyze failed; using local summary', analyzeError);
        }

        setStage('saving');
        const now = new Date().toISOString();
        const ideaId = createId();
        await addIdea({
          id: ideaId,
          userId: user.id,
          title: enrichment.title,
          category: enrichment.category,
          summary,
          transcript: enrichment.transcript,
          aiStory: enrichment.aiStory,
          analysis,
          audioUri,
          durationSec,
          language: enrichment.detectedLanguage,
          transcriptSource: enrichment.source,
          favorite: false,
          createdAt: now,
          updatedAt: now,
        });

        clearPending();
        setStage('done');
        router.replace(`/idea/${ideaId}`);
      } catch (e) {
        setStage('error');
        setError(e instanceof Error ? e.message : 'Processing failed');
      }
    })();
  }, [addIdea, clearPending, pending, router, user]);

  const activeSteps = ['transcribing', 'extracting', 'summarizing'] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.pulseCore} />
        <Ionicons name="sparkles" size={28} color={colors.primary} style={styles.sparkle} />

        <Text style={styles.title}>Organizing your idea...</Text>
        <Text style={styles.subtitle}>
          Creating a title and analyzing your transcript into thought, value, and expansion paths.
        </Text>

        <View style={styles.barTrack}>
          <View style={styles.barFill} />
        </View>

        {stage === 'error' ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Pressable
              onPress={() => {
                clearPending();
                router.replace('/(tabs)');
              }}
              style={styles.backBtn}
            >
              <Text style={styles.backText}>Back to Home</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.steps}>
            {activeSteps.map((step) => {
              const stepIndex = activeSteps.indexOf(step);
              const currentIndex =
                stage === 'saving' || stage === 'done'
                  ? activeSteps.length
                  : activeSteps.includes(stage as (typeof activeSteps)[number])
                    ? activeSteps.indexOf(stage as (typeof activeSteps)[number])
                    : -1;
              const done = currentIndex > stepIndex;
              const current = stage === step;
              return (
                <View key={step} style={styles.stepRow}>
                  {current ? (
                    <ActivityIndicator size="small" color={colors.onSurfaceVariant} />
                  ) : (
                    <Ionicons
                      name={done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={colors.onSurfaceVariant}
                    />
                  )}
                  <Text style={[styles.stepText, !done && !current && styles.stepMuted]}>
                    {STAGE_COPY[step]}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMargin,
  },
  pulseCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.secondary,
    marginBottom: spacing.stackLg,
  },
  sparkle: { position: 'absolute', top: '32%', left: '30%', opacity: 0.2 },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    color: colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
  },
  barTrack: {
    width: 180,
    height: 2,
    backgroundColor: colors.border,
    borderRadius: 999,
    marginTop: spacing.stackLg,
    overflow: 'hidden',
  },
  barFill: {
    width: '40%',
    height: '100%',
    backgroundColor: colors.secondary,
  },
  steps: { marginTop: spacing.stackLg, gap: 8, alignItems: 'flex-start' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepText: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  stepMuted: { opacity: 0.4 },
  errorBox: { marginTop: spacing.stackLg, alignItems: 'center', gap: 16 },
  error: {
    color: colors.error,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  backText: {
    color: colors.onPrimary,
    fontFamily: fonts.bodySemi,
  },
});
