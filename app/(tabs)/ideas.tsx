import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaCard } from '@/src/components/IdeaCard';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { CATEGORIES, colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

export default function IdeasScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  void languageCode;
  const [category, setCategory] = useState<string>('All');

  const ideas = useMemo(() => {
    if (!user) return [];
    const all = allIdeas
      .filter((idea) => idea.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (category === 'All') return all;
    return all.filter((idea) => idea.category === category);
  }, [user, allIdeas, category]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.brand}>Think Tap</Text>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{tx('myArchive')}</Text>
        <Text style={styles.subtitle}>
          {ideas.length} {tx('thoughtsCaptured')}
        </Text>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {CATEGORIES.map((item) => {
            const active = item === category;
            return (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={ideas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.stackMd }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No ideas in this category yet.</Text>
        }
        renderItem={({ item }) => (
          <IdeaCard
            idea={item}
            variant="archive"
            onPress={() => router.push(`/idea/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.containerMargin,
    paddingVertical: spacing.stackMd,
  },
  brand: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  titleBlock: {
    paddingHorizontal: spacing.containerMargin,
    marginBottom: spacing.stackMd,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    color: colors.onBackground,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  chipsWrap: {
    height: 52,
    marginBottom: spacing.stackMd,
    justifyContent: 'center',
  },
  chips: {
    paddingHorizontal: spacing.containerMargin,
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary },
  chipInactive: { backgroundColor: colors.chipInactive },
  chipText: {
    fontFamily: fonts.label,
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.onSurfaceVariant,
  },
  chipTextActive: { color: colors.onPrimary },
  list: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: 120,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    marginTop: spacing.stackLg,
  },
});
