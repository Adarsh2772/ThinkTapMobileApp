import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/ScreenHeader';
import { ThoughtSearchCard } from '@/src/components/ThoughtSearchCard';
import {
  SEARCH_SORTS,
  parseFragments,
  searchThoughts,
  type SearchSort,
} from '@/src/features/search/searchThoughts';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

const SUGGESTIONS = ['Bollywood movie', 'rain', 'dialogue about fathers'];

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SearchSort>('best_match');
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);
  const fragments = useMemo(() => parseFragments(query), [query]);

  const results = useMemo(() => {
    if (!user || fragments.length === 0) return [];
    const mine = allIdeas.filter((idea) => idea.userId === user.id);
    return searchThoughts(mine, query, sort).map((hit) => hit.idea);
  }, [user, allIdeas, query, sort, fragments.length]);

  const removeFragment = (fragment: string) => {
    const next = fragments.filter((item) => item !== fragment);
    setQuery(next.join(' '));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        <ScreenHeader title="Think Tap" subtitle="Find a thought from the words you spoke" />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={22} color={colors.secondary} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type a remembered fragment…"
          placeholderTextColor={colors.outlineVariant}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {fragments.length > 0 ? (
        <View style={styles.fragmentRow}>
          {fragments.map((item) => (
            <Pressable
              key={item}
              onPress={() => removeFragment(item)}
              style={styles.fragmentChip}
              accessibilityLabel={`Remove fragment ${item}`}
            >
              <Text style={styles.fragmentText}>{item}</Text>
              <Ionicons name="close" size={14} color={colors.onSecondaryFixedVariant} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {fragments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {SEARCH_SORTS.map((item) => {
            const active = item.id === sort;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSort(item.id)}
                style={[styles.sortChip, active && styles.sortChipActive]}
              >
                <Text style={[styles.sortText, active && styles.sortTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!query.trim() ? (
        <View style={styles.suggestions}>
          <Text style={styles.suggestLabel}>TRY A FRAGMENT</Text>
          <View style={styles.suggestWrap}>
            {SUGGESTIONS.map((item) => (
              <Pressable key={item} onPress={() => setQuery(item)} style={styles.suggestChip}>
                <Text style={styles.suggestText}>“{item}”</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="mic-outline" size={36} color={colors.secondary} />
            </View>
            <Text style={styles.emptyTitle}>Search what you said</Text>
            <Text style={styles.emptyBody}>
              Results come from your raw transcript only. Add another word to narrow the list. Word
              order can differ — “Bollywood movie” still finds “movie in Bollywood.”
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
            <Text style={styles.noResults}>
              {sort === 'recently_visited'
                ? 'No matching thoughts you have opened yet.'
                : sort === 'dormant_gems'
                  ? 'No matching dormant thoughts yet.'
                  : `No transcripts matched “${query.trim()}”.`}
            </Text>
          }
          renderItem={({ item }) => (
            <ThoughtSearchCard idea={item} onPress={() => router.push(`/idea/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.containerMargin },
  searchWrap: {
    marginHorizontal: spacing.containerMargin,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  input: {
    height: 56,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceContainerLowest,
    paddingLeft: 48,
    paddingRight: 16,
    fontFamily: fonts.body,
    fontSize: typography.bodyLg.fontSize,
    color: colors.onSurface,
  },
  fragmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.containerMargin,
    marginTop: spacing.stackMd,
  },
  fragmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.secondarySoft,
    borderWidth: 1,
    borderColor: colors.secondaryFixed,
  },
  fragmentText: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSecondaryFixedVariant,
  },
  sortRow: {
    paddingHorizontal: spacing.containerMargin,
    paddingVertical: spacing.stackMd,
    gap: 8,
    alignItems: 'center',
  },
  sortChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    backgroundColor: colors.chipInactive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortChipActive: { backgroundColor: colors.secondary },
  sortText: {
    fontFamily: fonts.label,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  sortTextActive: { color: colors.onPrimary },
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
    borderColor: colors.secondaryFixed,
    borderRadius: radii.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.secondarySoft,
  },
  suggestText: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSecondaryFixedVariant,
  },
  emptyState: { alignItems: 'center', marginTop: spacing.sectionGap, paddingHorizontal: 24 },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.secondarySoft,
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
