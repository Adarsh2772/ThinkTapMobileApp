import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaCard } from '@/src/components/IdeaCard';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

const SUGGESTIONS = [
  'Show my horror ideas',
  'Rap lyrics from last week',
  'Dialogue about fathers',
];

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);

  const results = useMemo(() => {
    if (!user || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return allIdeas
      .filter((idea) => idea.userId === user.id)
      .filter((idea) => {
        const haystack = `${idea.title} ${idea.summary} ${idea.transcript} ${idea.category}`.toLowerCase();
        return haystack.includes(q);
      });
  }, [user, allIdeas, query]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.brand}>Think Tap</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={22} color={colors.outline} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find my movie idea about rain..."
          placeholderTextColor={colors.outlineVariant}
          style={styles.input}
        />
      </View>

      {!query.trim() ? (
        <View style={styles.suggestions}>
          <Text style={styles.suggestLabel}>SUGGESTED FOR YOU</Text>
          <View style={styles.suggestWrap}>
            {SUGGESTIONS.map((item) => (
              <Pressable
                key={item}
                onPress={() => setQuery(item.replace(/^Show my /i, '').replace(/"/g, ''))}
                style={styles.suggestChip}
              >
                <Text style={styles.suggestText}>"{item}"</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="compass-outline" size={36} color={colors.outlineVariant} />
            </View>
            <Text style={styles.emptyTitle}>Deep Discovery</Text>
            <Text style={styles.emptyBody}>
              Search through your voice notes, text snippets, and generated concepts across all time.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.stackMd }} />}
          ListEmptyComponent={
            <Text style={styles.noResults}>No ideas matched “{query.trim()}”.</Text>
          }
          renderItem={({ item }) => (
            <IdeaCard
              idea={item}
              variant="archive"
              onPress={() => router.push(`/idea/${item.id}`)}
            />
          )}
        />
      )}
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
  searchWrap: {
    marginHorizontal: spacing.containerMargin,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  input: {
    height: 64,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingLeft: 48,
    paddingRight: 16,
    fontFamily: fonts.body,
    fontSize: typography.bodyLg.fontSize,
    color: colors.onSurface,
  },
  suggestions: {
    paddingHorizontal: spacing.containerMargin,
    marginTop: spacing.stackLg,
  },
  suggestLabel: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackMd,
    letterSpacing: 0.4,
  },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surfaceContainerLowest,
  },
  suggestText: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurface,
  },
  emptyState: { alignItems: 'center', marginTop: spacing.sectionGap, paddingHorizontal: 24 },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    color: colors.onSurface,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  list: { padding: spacing.containerMargin, paddingBottom: 120 },
  noResults: {
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    marginTop: spacing.stackLg,
  },
});
