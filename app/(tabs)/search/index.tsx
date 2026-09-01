import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeSyntheticEvent, TextInputFocusEventData } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';

import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { useAuth } from '@/hooks/useAuth';
import { logRequestFailure } from '@/lib/errorLog';
import { jellyfinKind, kindKey, tmdbKind } from '@/lib/kind';
import { oneLine } from '@/lib/text';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem, JellyseerrSearchResult } from '@/types';

type Section = { title: string; items: JellyseerrSearchResult[] };

/**
 * Results are a flat list rather than a SectionList so the two sources can
 * share one scroll container: what you already own on top, what you'd have to
 * request below it.
 */
type Row =
  | { kind: 'header'; title: string }
  | { kind: 'library'; item: JellyfinItem }
  | { kind: 'seerr'; item: JellyseerrSearchResult };

export default function SearchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const scrollY = useRef(new Animated.Value(0)).current;
  const { state } = useAuth();
  // Hoisted so the effects below depend on the id itself. Depending on
  // state.status alone missed a change of server, which keeps the status
  // 'signed-in' while the user behind it becomes someone else.
  const userId = state.status === 'signed-in' ? state.auth.userId : null;

  // The field is the system's, and the system's field is uncontrolled: it
  // reports what was typed, it does not take a value back. So the query lives
  // here rather than in a store, which is also the last thing that store was
  // for now that the hand-built tab bar is gone.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JellyseerrSearchResult[]>([]);
  const [library, setLibrary] = useState<JellyfinItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [discover, setDiscover] = useState<Section[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  /**
   * These two are memoised, and it matters.
   *
   * The search bar is not a component that renders - it registers itself with
   * the screen, and expo-router re-registers it whenever the props it was given
   * change identity. Inline arrows are a new identity every render, so each
   * keystroke tore the native search bar down and built a new one: the typed
   * text vanished, the results never arrived, and the field could not be
   * dismissed. `setQuery` is stable, so with these wrapped the registration
   * happens once.
   */
  const handleChangeText = useCallback(
    (e: NativeSyntheticEvent<TextInputFocusEventData>) => setQuery(e.nativeEvent.text),
    [],
  );
  const clearQuery = useCallback(() => setQuery(''), []);

  useEffect(() => {
    loadDiscover();
  // Discover is loaded once, on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDiscover() {
    setDiscoverLoading(true);
    try {
      /*
       * Each of these swallowed its own failure and returned an empty list,
       * every empty section was then filtered out, and a screen with nothing
       * on it was the result - no message, no error, nothing in the log. With
       * Jellyseerr unreachable the search tab was simply blank.
       *
       * They still degrade rather than throw, since four working rows are
       * better than none, but a failure is now recorded.
       */
      const note = (where: string) => (e: unknown) => {
        logRequestFailure(`search:${where}`, e);
        return [];
      };
      const [trending, movies, tv, anime, upcoming] = await Promise.all([
        Jellyseerr.discoverTrending().catch(note('trending')),
        Jellyseerr.discoverMovies().catch(note('movies')),
        Jellyseerr.discoverTv().catch(note('tv')),
        Jellyseerr.discoverAnime().catch(note('anime')),
        Jellyseerr.discoverUpcomingMovies().catch(note('upcoming')),
      ]);
      setDiscover([
        { title: t('search.sections.trending'), items: trending },
        { title: t('search.sections.popularMovies'), items: movies },
        { title: t('search.sections.popularTv'), items: tv },
        { title: t('search.sections.anime'), items: anime },
        { title: t('search.sections.upcoming'), items: upcoming },
      ].filter(s => s.items.length > 0));
    } finally {
      setDiscoverLoading(false);
    }
  }

  // Debounced auto-search when the shared query changes.
  useEffect(() => {
    if (!query.trim()) {
      // An emptied query clears the results it produced. There is no render-time
      // value to derive that from - the results came from the network.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLibrary([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const handle = setTimeout(async () => {
      // Both sources in parallel. A failing Jellyseerr shouldn't hide results
      // for media you already own, and vice versa.
      const [seerr, mine] = await Promise.all([
        Jellyseerr.search(query).catch(() => null),
        userId ? Jellyfin.searchLibrary(userId, query).catch(() => null) : Promise.resolve([]),
      ]);
      /*
       * TMDB's multi-search takes no keyword or certification parameter, so
       * this row can only drop what came back - by genre, the one thing a
       * search result carries. A filtered search is therefore shorter rather
       * than backfilled, and keyword-only filters do not narrow it at all.
       */
      setResults(seerr
        ? Jellyseerr.withoutExcludedGenres(seerr.filter(x => x.mediaType !== 'person'))
        : []);
      setLibrary(mine ?? []);
      setBusy(false);
      if (seerr === null && mine === null) {
        Alert.alert(t('search.failedTitle'), t('search.failedBody'));
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, userId, t]);

  function openDetail(item: JellyseerrSearchResult) {
    router.push(`/tmdb/${item.mediaType}/${item.id}`);
  }

  const showingSearch = query.trim().length > 0;

  const rows: Row[] = [];
  if (library.length > 0) {
    rows.push({ kind: 'header', title: t('search.sections.inYourLibrary') });
    library.forEach(item => rows.push({ kind: 'library', item }));
  }
  if (results.length > 0) {
    rows.push({ kind: 'header', title: t('search.sections.requestNew') });
    results.forEach(item => rows.push({ kind: 'seerr', item }));
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/*
        * The search field is the system's, not ours.
        *
        * What was here was a rounded View with a TextInput in it, inherited from
        * the hand-built tab bar. iOS 26 has somewhere better to put it: with the
        * tab declared role="search", a search bar that allows toolbar
        * integration is drawn into the bottom bar, right above the thumb,
        * instead of sitting at the top of the content. That is the toolbar in
        * Apple's Liquid Glass documentation, and the same one the App Store
        * uses.
        *
        * A search bar is a property of a navigation header, which is why this
        * screen has a stack of its own (see _layout.tsx). Declaring it is the
        * whole of it: the tab bar takes the field on iOS 26, and on anything
        * older the same declaration stays in the header. Either way nothing
        * here draws a field of its own any more.
        */}
      <Stack.SearchBar
        placeholder={t('search.placeholder')}
        // The native bar reports through an event, not a plain string.
        onChangeText={handleChangeText}
        // Cancel wipes the field itself; the results have to be told.
        onCancelButtonPress={clearQuery}
        onClose={clearQuery}
        autoCapitalize="none"
        // It is the only control on the screen - it should not disappear the
        // moment you scroll the results it produced.
        hideWhenScrolling={false}
        textColor={colors.text}
        hintTextColor={colors.textDim}
        tintColor={colors.text}
        headerIconColor={colors.textMuted}
      />
      {showingSearch ? (
        busy ? (
          <>
            <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
          </>
        ) : (
          <Animated.FlatList
            data={rows}
            keyExtractor={(r: Row) =>
              r.kind === 'header' ? `h-${r.title}`
                : r.kind === 'library' ? `lib-${r.item.Id}`
                  : `seerr-${r.item.mediaType}-${r.item.id}`
            }
            renderItem={({ item: row }: { item: Row }) =>
              row.kind === 'header' ? (
                <Text style={styles.resultsHeader}>{row.title}</Text>
              ) : row.kind === 'library' ? (
                <LibraryRow item={row.item} onOpen={() => router.push(`/item/${row.item.Id}`)} />
              ) : (
                <ResultRow item={row.item} onOpen={() => openDetail(row.item)} />
              )
            }
            ItemSeparatorComponent={({ leadingItem }: { leadingItem: Row }) =>
              leadingItem?.kind === 'header' ? null : <View style={styles.sep} />
            }
            ListHeaderComponent={<View style={{ height: headerHeight }} />}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: 150 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Host style={styles.center} colorScheme="dark">
                <ContentUnavailableView
                  title={t('search.noResults')}
                  systemImage="magnifyingglass"
                />
              </Host>
            }
          />
        )
      ) : discoverLoading ? (
        <>
          <View style={{ height: headerHeight }} />
          <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
        </>
      ) : discover.length === 0 ? (
        /*
         * Nothing to browse, said out loud.
         *
         * This branch did not exist: with every row empty the screen rendered
         * an empty scroller, which on a phone is an entirely blank tab. The
         * rows come from Jellyseerr, so the usual reason is that it cannot be
         * reached - which is worth saying, and worth being able to retry.
         */
        <>
          <View style={{ height: headerHeight }} />
          <View style={styles.center}>
            <Host style={styles.emptyHost} colorScheme="dark">
              <ContentUnavailableView
                title={t('search.failedTitle')}
                systemImage="magnifyingglass"
                description={t('search.failedBody')}
              />
            </Host>
            <TouchableOpacity style={styles.retry} onPress={loadDiscover} activeOpacity={0.7}>
              <Text style={styles.retryLabel}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={{ paddingBottom: 150 }}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          <View style={{ height: headerHeight }} />
          {discover.map(sec => (
            <DiscoverRow key={sec.title} section={sec} onOpen={openDetail} />
          ))}
        </Animated.ScrollView>
      )}
      <TabHeader title={t('tabs.search')} scrollY={scrollY} />
    </View>
  );
}

function DiscoverRow({ section, onOpen }: { section: Section; onOpen: (item: JellyseerrSearchResult) => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <FlatList
        horizontal
        data={section.items}
        keyExtractor={i => `${section.title}-${i.mediaType}-${i.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        renderItem={({ item }) => <DiscoverCard item={item} onOpen={() => onOpen(item)} />}
      />
    </View>
  );
}

function DiscoverCard({ item, onOpen }: { item: JellyseerrSearchResult; onOpen: () => void }) {
  const { t } = useTranslation();
  const title = item.title ?? item.name ?? '';
  const kind = t(kindKey(tmdbKind(item)));
  const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null;
  const available = item.mediaInfo?.status === 5;
  const requested = (item.mediaInfo?.requests?.length ?? 0) > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onOpen}
      accessibilityRole="button"
      // Availability is a badge drawn over the poster, so it has to be said.
      accessibilityLabel={[
        title,
        kind,
        available ? t('badge.available') : requested ? t('badge.requested') : '',
      ].filter(Boolean).join(', ')}
    >
      <View style={styles.posterWrap}>
        {poster ? (
          <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]} />
        )}
        {available ? (
          <View style={[styles.badgeOverlay, styles.badgeAvailable]}><Text style={styles.badgeOverlayText}>{t('badge.available')}</Text></View>
        ) : requested ? (
          <View style={styles.badgeOverlay}><Text style={styles.badgeOverlayText}>{t('badge.requested')}</Text></View>
        ) : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.cardMeta}>{kind}</Text>
    </TouchableOpacity>
  );
}

function LibraryRow({ item, onOpen }: { item: JellyfinItem; onOpen: () => void }) {
  const { t } = useTranslation();
  const year = item.ProductionYear ? String(item.ProductionYear) : '';
  const tag = item.ImageTags?.Primary;
  const poster = tag ? Jellyfin.imageUrl(item.Id, tag, 'Primary', 200) : null;
  const kind = t(kindKey(jellyfinKind(item)));

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onOpen}
      activeOpacity={0.7}
      accessibilityRole="button"
      // This row is the one that plays rather than requests, which is the whole
      // difference between it and the row below - so the label says so.
      accessibilityLabel={[item.Name, kind, year, t('badge.play')].filter(Boolean).join(', ')}
    >
      {poster ? (
        <Image source={{ uri: poster }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.posterEmpty]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.Name}</Text>
        <Text style={styles.rowMeta}>{kind} {year ? `· ${year}` : ''}</Text>
        {item.Overview ? <Text style={styles.rowOverview} numberOfLines={2}>{oneLine(item.Overview)}</Text> : null}
      </View>
      <View style={[styles.badge, styles.badgeAvailable]}><Text style={styles.badgeText}>{t('badge.play')}</Text></View>
    </TouchableOpacity>
  );
}

function ResultRow({ item, onOpen }: { item: JellyseerrSearchResult; onOpen: () => void }) {
  const { t } = useTranslation();
  const title = item.title ?? item.name ?? '';
  const kind = t(kindKey(tmdbKind(item)));
  const year = (item.releaseDate ?? item.firstAirDate ?? '').slice(0, 4);
  const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null;
  const available = item.mediaInfo?.status === 5;
  const requested = (item.mediaInfo?.requests?.length ?? 0) > 0;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onOpen}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[
        title,
        kind,
        year,
        available ? t('badge.available') : requested ? t('badge.requested') : '',
      ].filter(Boolean).join(', ')}
    >
      {poster ? (
        <Image source={{ uri: poster }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.posterEmpty]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rowMeta}>{kind} {year ? `· ${year}` : ''}</Text>
        {item.overview ? <Text style={styles.rowOverview} numberOfLines={2}>{oneLine(item.overview)}</Text> : null}
      </View>
      {available ? (
        <View style={[styles.badge, styles.badgeAvailable]}><Text style={styles.badgeText}>{t('badge.available')}</Text></View>
      ) : requested ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{t('badge.requested')}</Text></View>
      ) : null}
    </TouchableOpacity>
  );
}

const CARD_WIDTH = 120;
const CARD_HEIGHT = 180;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyText: { ...type.body, color: colors.textDim },
  // The system's empty view sizes itself to its content; without a height to
  // fill it collapses inside a flex parent and draws nothing at all.
  emptyHost: { width: '100%', height: 220 },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  retryLabel: { ...type.bodyStrong, color: colors.text },
  input: {
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  section: { marginBottom: spacing.xl },
  sectionHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { ...type.h2, color: colors.text },
  resultsHeader: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  card: { width: CARD_WIDTH },
  posterWrap: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  poster: { width: '100%', height: '100%' },
  posterEmpty: { backgroundColor: colors.surface },
  cardTitle: { marginTop: spacing.sm, ...type.small, color: colors.text },
  cardMeta: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: 2 },

  badgeOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassTint,
  },
  badgeOverlayText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    // last line of defence over a white poster
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  row: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, alignItems: 'center' },
  thumb: { width: 60, height: 90, borderRadius: radius.sm, backgroundColor: colors.surface },
  rowText: { flex: 1 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.xs },
  rowOverview: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 60 + spacing.md },

  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  badgeText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },
  // green means you can watch it now - both 'Available' and the library's 'Play'
  badgeAvailable: { backgroundColor: colors.successTint, borderColor: colors.successBorder },
});
