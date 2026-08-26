import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/date';
import { groupByDay, historyTitle, type HistorySection } from '@/lib/history';
import { logRequestFailure } from '@/lib/errorLog';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

const PAGE = 60;

/**
 * What has been watched, by day.
 *
 * Continue Watching answers "where was I"; this answers "what did I watch",
 * which is a different question and was not answerable anywhere in the app -
 * Jellyfin has known all along.
 *
 * A flat list of rows with day headers rather than a SectionList: the sections
 * come from `groupByDay`, which is tested, and flattening them here keeps
 * paging to one list rather than one per day.
 */
type Row =
  | { kind: 'day'; day: string }
  | { kind: 'item'; item: JellyfinItem };

function flatten(sections: HistorySection[]): Row[] {
  return sections.flatMap<Row>(section => [
    { kind: 'day', day: section.day },
    ...section.items.map(item => ({ kind: 'item' as const, item })),
  ]);
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Paging state that must not cause a render: read inside the end-reached
  // handler, which is what stops two pages being asked for at once.
  const fetching = useRef(false);

  const loadPage = useCallback(async (startIndex: number) => {
    if (state.status !== 'signed-in' || fetching.current) return;
    fetching.current = true;
    try {
      const page = await Jellyfin.getPlayedItems(state.auth.userId, PAGE, startIndex);
      setItems(prev => (startIndex === 0 ? page.items : [...prev, ...page.items]));
      setTotal(page.total);
      setError(null);
    } catch (e: any) {
      logRequestFailure('history:load', e);
      setError(e?.message ?? String(e));
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const rows = flatten(groupByDay(items));
  const more = items.length < total;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Stack.Screen options={{ title: t('nav.history') }} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{error}</Text>
        </View>
      ) : rows.length === 0 ? (
        <Host style={styles.center} colorScheme="dark">
          <ContentUnavailableView
            title={t('nav.history')}
            systemImage="clock.arrow.circlepath"
            description={t('history.empty')}
          />
        </Host>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => (row.kind === 'day' ? `day-${row.day}` : row.item.Id)}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (more) loadPage(items.length); }}
          ListHeaderComponent={
            <Text style={styles.count}>{t('history.count', { count: total })}</Text>
          }
          renderItem={({ item: row }) =>
            row.kind === 'day'
              ? <Text style={styles.day}>{formatDate(row.day)}</Text>
              : (
                <HistoryRow
                  item={row.item}
                  onOpen={() => router.push(`/item/${row.item.Id}`)}
                  onUnwatch={async () => {
                    if (state.status !== 'signed-in') return;
                    try {
                      await Jellyfin.setPlayed(state.auth.userId, row.item.Id, false);
                      loadPage(0);
                    } catch (e) {
                      logRequestFailure('history:unwatch', e);
                    }
                  }}
                />
              )
          }
          ListFooterComponent={
            more ? <ActivityIndicator color={colors.textMuted} style={{ marginVertical: spacing.lg }} /> : null
          }
        />
      )}
    </View>
  );
}

/**
 * A plain row, deliberately - no `ItemLink` here.
 *
 * Everywhere else a poster is an ItemLink, which wraps it in a native context
 * menu with a peek at the destination. This screen is reached from Profile,
 * which is presented modally, and a UIKit context menu that pushes a route
 * from inside a modal presentation took the whole app down - a native crash,
 * with nothing in the JS log but the runtime shutting down afterwards.
 *
 * So: tap opens, long press offers the one action worth having here.
 */
function HistoryRow({ item, onOpen, onUnwatch }: {
  item: JellyfinItem;
  onOpen: () => void;
  onUnwatch: () => void;
}) {
  const { t } = useTranslation();
  const tag = item.ImageTags?.Primary;
  const runtimeMin = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : null;

  function askUnwatch() {
    Alert.alert(historyTitle(item), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('menu.markUnwatched'), onPress: onUnwatch },
    ]);
  }

  return (
    <TouchableOpacity onPress={onOpen} onLongPress={askUnwatch} activeOpacity={0.7} accessibilityRole="button">
      <View style={styles.row}>
        {tag ? (
          <Image
            source={{ uri: Jellyfin.imageUrl(item.Id, tag, 'Primary', 200) }}
            style={styles.thumb}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{historyTitle(item)}</Text>
          {runtimeMin ? <Text style={styles.meta}>{runtimeMin}m</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  empty: { ...type.body, color: colors.textDim, textAlign: 'center' },
  count: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  day: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  thumb: { width: 54, height: 80, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { ...type.body, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
