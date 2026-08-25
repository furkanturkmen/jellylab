import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { ItemLink } from '@/components/ItemLink';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

/**
 * One library, all of it.
 *
 * The Library tab shows a row of the twenty most recent titles per library,
 * which is a sample and says so - the count beside the name is the real total.
 * This is where that total can actually be walked: same sort, three across,
 * fetched a page at a time as you scroll.
 */

const COLUMNS = 3;
/** Big enough that scrolling rarely waits, small enough to draw quickly. */
const PAGE = 48;

export default function LibraryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { t } = useTranslation();
  const { state } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Paging state that must not trigger a render: reading it inside the
  // end-reached handler is what stops two pages being requested at once.
  const fetching = useRef(false);

  const loadPage = useCallback(async (startIndex: number) => {
    if (state.status !== 'signed-in' || fetching.current) return;
    fetching.current = true;
    try {
      const page = await Jellyfin.getItems(state.auth.userId, id, PAGE, 'recent', startIndex);
      // Appending by index rather than concatenating blindly: a page that
      // arrives after a refresh would otherwise duplicate what is already here.
      setItems(prev => (startIndex === 0 ? page.items : [...prev.slice(0, startIndex), ...page.items]));
      setTotal(page.total);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [id, state]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const cardWidth = (width - spacing.xl * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS;
  const more = items.length < total;

  return (
    <View style={styles.root}>
      {/* Header does its normal job - name and back control, both pinned - but
          paints no bar behind itself, so the grid runs the full height of the
          screen and the two stay legible over it the whole way down. */}
      <Stack.Screen
        options={{
          title: name ?? '',
          headerTransparent: true,
          // Undoes the app-wide header background: an explicit colour beats
          // headerTransparent, so without this the bar is painted black.
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
      <StatusBar style="light" />
      {loading && items.length === 0 ? (
        <View style={[styles.center, { paddingTop: insets.top + 52 }]}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.Id}
          numColumns={COLUMNS}
          contentContainerStyle={[styles.grid, { paddingTop: insets.top + 52 }]}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <PosterCard
              item={item}
              width={cardWidth}
              // Patched in place rather than reloaded: this grid can be pages
              // deep, and re-reading page one would throw the rest away.
              onChanged={played => setItems(prev => prev.map(i => (
                i.Id === item.Id
                  ? { ...i, UserData: { PlaybackPositionTicks: played ? 0 : i.UserData?.PlaybackPositionTicks ?? 0, Played: played } }
                  : i
              )))}
            />
          )}
          // Half a screen of slack, so the next page is usually already there
          // by the time the last row is reached.
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (more) loadPage(items.length); }}
          ListHeaderComponent={
            <Text style={styles.count}>{t('library.itemCount', { count: total })}</Text>
          }
          ListFooterComponent={
            more ? <View style={styles.footer}><ActivityIndicator color={colors.textMuted} /></View> : <View style={styles.footer} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error ?? t('library.emptyLibrary')}</Text>
          }
        />
      )}
    </View>
  );
}

function PosterCard({ item, width, onChanged }: {
  item: JellyfinItem;
  width: number;
  onChanged?: (played: boolean) => void;
}) {
  const tag = item.ImageTags?.Primary;
  return (
    <ItemLink item={item} onChanged={onChanged}>
      <View
        style={{ width }}
        accessibilityRole="button"
        accessibilityLabel={item.ProductionYear ? `${item.Name}, ${item.ProductionYear}` : item.Name}
      >
        <View>
          <Image
            source={{ uri: Jellyfin.imageUrl(item.Id, tag, 'Primary', Math.round(width * 3)) }}
            style={[styles.poster, { width, height: width * 1.5 }]}
            contentFit="cover"
            transition={200}
          />
          {item.UserData?.Played ? (
            <View style={styles.watched}>
              <Text style={styles.watchedMark}>✓</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.Name}</Text>
        {item.ProductionYear ? <Text style={styles.year}>{item.ProductionYear}</Text> : null}
      </View>
    </ItemLink>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  row: { gap: spacing.md, marginBottom: spacing.xl },
  count: { ...type.small, color: colors.textDim, marginBottom: spacing.lg },
  // The tick sits on the poster, not beside it: the corner is the one place
  // that is never part of the title or the year.
  watched: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successBorder,
  },
  watchedMark: { color: colors.text, fontSize: 12, fontWeight: '700' },
  poster: { borderRadius: radius.md, backgroundColor: colors.surface },
  title: { marginTop: spacing.sm, ...type.small, color: colors.text },
  year: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  footer: { height: 64, alignItems: 'center', justifyContent: 'center' },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
