import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
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
      {/* iOS draws this one, not us. A large title that collapses into the bar
          as you scroll, over a material that is invisible at the top and fades
          in only once content passes under it - the behaviour we were building
          out of interpolations and a hand-made scrim.
          headerStyle stays transparent so the app-wide background does not
          paint over the material. */}
      <Stack.Screen
        options={{
          title: name ?? '',
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerTransparent: true,
          headerBlurEffect: 'systemChromeMaterialDark',
          headerStyle: { backgroundColor: 'transparent' },
          headerLargeStyle: { backgroundColor: 'transparent' },
        }}
      />
      <StatusBar style="light" />
      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.Id}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          // The header's height is no longer ours to guess: the system insets
          // the content for it, large title and all.
          contentInsetAdjustmentBehavior="automatic"
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => <PosterCard item={item} width={cardWidth} />}
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

function PosterCard({ item, width }: { item: JellyfinItem; width: number }) {
  const tag = item.ImageTags?.Primary;
  return (
    <Link href={`/item/${item.Id}`} asChild>
      <TouchableOpacity
        style={{ width }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={item.ProductionYear ? `${item.Name}, ${item.ProductionYear}` : item.Name}
      >
        <Image
          source={{ uri: Jellyfin.imageUrl(item.Id, tag, 'Primary', Math.round(width * 3)) }}
          style={[styles.poster, { width, height: width * 1.5 }]}
          contentFit="cover"
          transition={200}
        />
        <Text style={styles.title} numberOfLines={1}>{item.Name}</Text>
        {item.ProductionYear ? <Text style={styles.year}>{item.ProductionYear}</Text> : null}
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  row: { gap: spacing.md, marginBottom: spacing.xl },
  count: { ...type.small, color: colors.textDim, marginBottom: spacing.lg },
  poster: { borderRadius: radius.md, backgroundColor: colors.surface },
  title: { marginTop: spacing.sm, ...type.small, color: colors.text },
  year: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  footer: { height: 64, alignItems: 'center', justifyContent: 'center' },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
