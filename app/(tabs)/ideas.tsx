import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    AppState,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaCard } from '@/src/components/IdeaCard';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { guardedNavigate } from '@/src/utils/guardedNavigate';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { readQueueStatuses, type QueueStatus } from '@/src/services/transcriptionQueue';
import {
    categoryColor,
    colors,
    fonts,
    normalizeCategory,
    radii,
    spacing,
    typography,
} from '@/src/theme/tokens';

export default function IdeasScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);
  const deleteIdea = useIdeasStore((s) => s.deleteIdea);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  void languageCode;
  const [category, setCategory] = useState<string>('');
  const [queueStatuses, setQueueStatuses] = useState<Map<string, QueueStatus>>(new Map());

  /**
   * WHY this exists: a card showing "Preparing your Thought…" with a spinner
   * used to mean exactly that whether the app was mid-attempt or had been
   * sitting offline for ten minutes - both looked identical, like something
   * was actively happening the whole time. Reading the real queue status
   * lets each card show "waiting for a connection" honestly instead, and
   * only spin while a retry is genuinely in flight. See queueForTranscription
   * for where offline takes actually land, and startAutoRetry (started from
   * the Home screen) for what actually drives a retry once you're back
   * online - this effect only reads that state to reflect it, it does not
   * drive the retries itself.
   */
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const statuses = await readQueueStatuses();
      if (!cancelled) setQueueStatuses(statuses);
    };
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    // 8s: matches the idea detail screen's own poll interval.
    const id = setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(id);
    };
  }, []);

  const myIdeas = useMemo(() => {
    if (!user) return [];
    return allIdeas
      .filter((idea) => idea.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [user, allIdeas]);

  /**
   * Which category tabs exist, and in what order - per the client's
   * corrected spec: no fixed set of 7 tabs, no "All" tab. A tab exists
   * only while at least one thought of that category exists, and tabs are
   * ordered by which category was most recently added to - record a movie
   * thought and only Movies shows; sing a song next and Songs jumps in
   * front of Movies; another movie thought and Movies leads again.
   *
   * WHY "most recently touched", not creation order or a fixed order:
   * this is what "whichever is recent it is first" actually means - the
   * category ranking follows the single most recent thought in each
   * category, not a running count. A category with one thought from a
   * minute ago outranks one with ten thoughts from last month.
   *
   * WHY this needs no special-case deletion handling: like the count-
   * based version this replaced, nothing here is cached - every render
   * where allIdeas actually changed recomputes which categories still
   * have at least one thought at all. Delete the last thought in a
   * category and it simply is not in this list on the next render - the
   * tab disappears because it was never anything more than "categories
   * currently present", not because anything detected and reacted to a
   * delete specifically.
   */
  const activeCategories = useMemo(() => {
    const lastTouched = new Map<string, string>();
    for (const idea of myIdeas) {
      const cat = normalizeCategory(idea.category);
      const existing = lastTouched.get(cat);
      if (!existing || idea.createdAt > existing) {
        lastTouched.set(cat, idea.createdAt);
      }
    }
    return Array.from(lastTouched.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([cat]) => cat);
  }, [myIdeas]);

  /**
   * WHY this effect exists: the selected tab needs to stay a real,
   * currently-visible tab at all times, since there is no "All" fallback
   * to fall back to anymore. Two cases land here - the very first thought
   * ever saved (category starts empty, nothing was selectable yet), and
   * the selected tab's last thought just got deleted (its tab just
   * vanished out from under the selection). Both are handled the same
   * way: select whichever tab is now first. Deliberately does NOT run
   * just because the order shifted - selecting a movie thought while
   * viewing Business should not yank you over to Movies just because
   * Movies became first; it only steps in when the tab actually being
   * viewed is no longer on the list at all.
   */
  useEffect(() => {
    if (activeCategories.length === 0) {
      if (category !== '') setCategory('');
      return;
    }
    if (!activeCategories.includes(category)) {
      setCategory(activeCategories[0]);
    }
  }, [activeCategories, category]);

  const ideas = useMemo(() => {
    if (!category) return [];
    return myIdeas.filter((idea) => normalizeCategory(idea.category) === category);
  }, [myIdeas, category]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        <ScreenHeader title="Think Tap" subtitle={tx('myArchive')} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{tx('myArchive')}</Text>
        <Text style={styles.subtitle}>
          {ideas.length} {tx('thoughtsCaptured')}
        </Text>
      </View>

      {activeCategories.length > 0 ? (
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {activeCategories.map((item) => {
              const active = item === category;
              const tint = categoryColor(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: tint.bg }
                      : { backgroundColor: tint.soft },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? tint.fg : tint.bg },
                    ]}
                    numberOfLines={1}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={ideas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.stackMd }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {myIdeas.length === 0
              ? 'No Thoughts captured yet.'
              : 'No thoughts in this category yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <IdeaCard
            idea={item}
            variant="archive"
            queueState={queueStatuses.get(item.id)}
            onPress={() => guardedNavigate(() => router.push(`/idea/${item.id}`))}
            onDelete={() => void deleteIdea(item.id)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.containerMargin },
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
  chipText: {
    fontFamily: fonts.label,
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
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
