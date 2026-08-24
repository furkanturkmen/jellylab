import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, PixelRatio, RefreshControl, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem, JellyfinView } from '@/types';

type LibraryItem = { view: JellyfinView; items: JellyfinItem[]; total: number };

/**
 * How many posters a library row holds.
 *
 * The row is a sample, not the library: what is on the server is shown next to
 * the name, so a row of 20 out of 213 does not read as "you own 20 films".
 */
const ROW_LIMIT = 20;

const HERO_COUNT = 5;
const HERO_INTERVAL_MS = 7000;
/** Upper bound on requested backdrop width, so a tablet doesn't pull 4K. */
const HERO_MAX_PX = 2560;
/**
 * Slight over-scale on the stretchy header. The maths for "grow to exactly
 * fill the rubber-band" lands on the container edge precisely, so a few
 * percent of headroom keeps rounding from showing a hairline of background.
 */
const HERO_STRETCH_SLOP = 1.08;
/**
 * Flat darkening over the backdrop, on top of the two gradients. Those only
 * shade the top and bottom edges, so a bright frame still washed out the title
 * across the middle. One dial: 0 is off, 0.9 is almost solid black.
 */
const HERO_SHADE = 0.3;

/**
 * How stale the screen may be before returning to it refetches.
 *
 * Coming back from an episode should show the new progress, and that is the
 * whole point of refreshing on focus. Flicking between tabs should not hammer
 * the server, and nothing here changes second to second.
 */
const REFRESH_AFTER_MS = 5000;

/**
 * The hero taps straight through to playback, so it can only feature things
 * you actually own — trending/TMDB would land on a Request screen instead.
 *
 * Priority: what you're part-way through, then what arrived recently, then
 * anything else. Backdrop-less items are skipped because the fallback is a
 * portrait poster stretched across a 360pt-tall banner.
 */
function buildHeroPool(resume: JellyfinItem[], latest: JellyfinItem[], libs: LibraryItem[]): JellyfinItem[] {
  const seen = new Set<string>();
  const pool: JellyfinItem[] = [];
  const add = (item?: JellyfinItem) => {
    if (!item || seen.has(item.Id)) return;
    if (item.Type !== 'Movie' && item.Type !== 'Series') return;
    if ((item.BackdropImageTags?.length ?? 0) === 0) return;
    seen.add(item.Id);
    pool.push(item);
  };

  resume.slice(0, 2).forEach(add);
  latest.forEach(add);
  libs.flatMap(l => l.items).forEach(add);
  return pool.slice(0, HERO_COUNT);
}

/**
 * What to put under "Library didn't load".
 *
 * The axios interceptor in `api/jellyfin` has already appended the address a
 * request could not reach, so a transport failure arrives here describing
 * itself. An HTTP status means the server did answer, and the only one worth
 * its own wording is a rejected token - "Network Error" would send you off
 * checking a server that is up and answering fine.
 */
function describeError(e: any): string {
  const status = e?.response?.status;
  if (status === 401 || status === 403) return 'auth';
  return e?.message || String(e);
}

/**
 * Let a long address break at its own separators.
 *
 * A URL is one unbroken word as far as text layout is concerned, so it either
 * overflows its container or breaks at an arbitrary character. Zero-width
 * spaces after the separators give the line breaker somewhere sensible to stop:
 * the break lands after a slash or a dot, and nothing is added to what the text
 * actually says - a copied line still pastes as the original address.
 */
function breakable(text: string): string {
  return text.replace(/([/.:?&=-])/g, '$1\u200B');
}

export default function LibraryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const { state } = useAuth();
  const [resume, setResume] = useState<JellyfinItem[]>([]);
  const [latest, setLatest] = useState<JellyfinItem[]>([]);
  const [libs, setLibs] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const inFlight = useRef(false);
  const loadedAt = useRef(0);

  /**
   * `silent` skips the spinner: a refresh on focus should replace the contents
   * underneath you, not make the screen look like it is loading for the first
   * time.
   */
  async function load(silent = false) {
    if (state.status !== 'signed-in') return;
    if (silent && inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    // Each call is allowed to fail on its own. One slow or unhappy library
    // used to reject the whole Promise.all, which surfaced as an uncaught
    // "AxiosError: Network Error" and left the screen empty even though
    // everything else had loaded fine.
    //
    // The failures are kept rather than dropped, because swallowing them made
    // a dead server and an empty library render identically: a blank shelf
    // either way, with no way to tell which one you were looking at.
    const failures: string[] = [];
    const note = (e: unknown) => { failures.push(describeError(e)); };
    try {
      const [views, resumeItems] = await Promise.all([
        Jellyfin.getViews(state.auth.userId).catch(e => { note(e); return [] as JellyfinView[]; }),
        Jellyfin.getResumeItems(state.auth.userId, 12).catch(e => { note(e); return [] as JellyfinItem[]; }),
      ]);
      const filtered = views.filter(v => v.CollectionType === 'movies' || v.CollectionType === 'tvshows');
      // One wave, not two: the rows and the latest-items calls do not depend on
      // each other, and running them in sequence spent an extra round trip on
      // every load - 281ms against 218ms, measured on the LAN, and worse over a
      // VPN where the round trip is the expensive part.
      const [withItems, latestItems] = await Promise.all([
        Promise.all(
          filtered.map(async view => {
            // Newest first. Sorted by name, a row was the alphabetical head of
            // the library forever: fine at 24 items, and at 200 it means the
            // A's and nothing else, with anything just added never appearing.
            const page = await Jellyfin.getItems(state.auth.userId, view.Id, ROW_LIMIT, 'recent')
              .catch(e => { note(e); return { items: [] as JellyfinItem[], total: 0 }; });
            return { view, items: page.items, total: page.total };
          })
        ),
        Promise.all(
          filtered.map(view => Jellyfin.getLatestItems(state.auth.userId, view.Id, 6).catch(e => { note(e); return []; }))
        ).then(r => r.flat()),
      ]);
      setResume(resumeItems);
      setLatest(latestItems);
      setLibs(withItems);
      // Only take over the screen when there is nothing to show. A single row
      // that failed while the rest loaded is not worth an error page - the
      // pull to refresh is right there.
      const nothing = resumeItems.length === 0 && withItems.every(l => l.items.length === 0);
      setError(nothing && failures.length > 0 ? failures[0] : null);
    } catch (e) {
      // The per-call catches above keep partial results, so anything reaching
      // here is unexpected rather than a server being briefly unreachable.
      setError(describeError(e));
    } finally {
      inFlight.current = false;
      loadedAt.current = Date.now();
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [state.status]);

  // `load` is redefined every render, so the focus callback reads it through a
  // ref - otherwise the effect would either capture a stale closure or re-run
  // on every render, which for a focus effect means refetching constantly.
  const loadRef = useRef(load);
  loadRef.current = load;

  /**
   * Refetch when the tab is opened again.
   *
   * Watch an episode and come back, and Continue Watching was showing the
   * position from before you left: the only trigger was the auth state
   * changing, so the screen went stale the moment you navigated away from it.
   */
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - loadedAt.current > REFRESH_AFTER_MS) loadRef.current(true);
    }, [])
  );

  if (state.status !== 'signed-in' || (loading && libs.length === 0 && resume.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={{ height: headerHeight }} />
        <View style={styles.errorCenter}>
          <View style={styles.errorIcon}>
            <SymbolView
              name={{ ios: 'exclamationmark.triangle', android: 'error', web: 'error' }}
              tintColor={colors.textMuted}
              size={48}
            />
          </View>
          <Text style={styles.errorTitle}>{t('library.unavailableTitle')}</Text>
          <Text style={styles.errorBody}>
            {error === 'auth' ? t('library.unavailableAuth') : t('library.unavailableBody')}
          </Text>
          {error === 'auth' ? null : <Text style={styles.errorDetail}>{breakable(error)}</Text>}
          <TouchableOpacity style={styles.retry} onPress={() => load()} activeOpacity={0.7} disabled={loading}>
            {/* The button is the only moving part on this screen, so it has to
                carry the wait itself - otherwise a retry against a server that
                is still down looks like a dead tap. */}
            {loading
              ? <ActivityIndicator color={colors.accentContrast} />
              : <Text style={styles.retryText}>{t('common.retry')}</Text>}
          </TouchableOpacity>
        </View>
        <TabHeader title={t('tabs.library')} scrollY={scrollY} />
      </View>
    );
  }

  const heroPool = buildHeroPool(resume, latest, libs);
  // Nothing in the library has a backdrop — fall back to a single still hero.
  const heroItems = heroPool.length > 0
    ? heroPool
    : [resume[0] ?? libs[0]?.items[0]].filter(Boolean) as JellyfinItem[];

  const heroHeight = HERO_HEIGHT + headerHeight;
  const heroItem = heroItems[heroIndex] ?? heroItems[0];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Behind the list on purpose — see HeroBackdrop. */}
      {heroItem ? (
        <HeroBackdrop item={heroItem} height={heroHeight} topInset={headerHeight} scrollY={scrollY} />
      ) : null}
      <Animated.FlatList
        data={libs}
        keyExtractor={(l: LibraryItem) => l.view.Id}
        style={styles.transparent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.text} progressViewOffset={headerHeight} />}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            {heroItems.length > 0 ? (
              <HeroOverlay items={heroItems} height={heroHeight} index={heroIndex} onIndex={setHeroIndex} />
            ) : null}
            {/* Everything past the hero is opaque, otherwise the pinned
                backdrop shows through the list as it scrolls over it. */}
            {resume.length > 0 ? (
              <View style={styles.opaque}>
                <ContinueWatchingRow items={resume} title={t('library.continueWatching')} />
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }: { item: LibraryItem }) => (
          <View style={styles.opaque}><LibraryRow lib={item} /></View>
        )}
        ListFooterComponent={<View style={[styles.opaque, styles.listFooter]} />}
      />
      <TabHeader title={t('tabs.library')} scrollY={scrollY} />
    </View>
  );
}

/**
 * Lives OUTSIDE the FlatList, pinned to the top of the screen and behind it.
 *
 * That placement is the whole point: a backdrop inside the list is clipped by
 * its own container, and one extended upward to escape that clip ends up
 * painting over the refresh spinner, which iOS draws behind scroll-view
 * content. Sitting behind the list, it can grow freely and the spinner still
 * reads.
 */
function HeroBackdrop({ item, height, topInset, scrollY }: {
  item: JellyfinItem;
  height: number;
  topInset: number;
  scrollY: Animated.Value;
}) {
  const { width } = useWindowDimensions();
  const backdrop = item.BackdropImageTags?.[0];
  const primary = item.ImageTags?.Primary;
  const tag = backdrop ?? primary;
  const imageType: 'Backdrop' | 'Primary' = backdrop ? 'Backdrop' : 'Primary';
  // Ask for the real pixel width of the device. Jellyfin caps at the source
  // resolution anyway, so over-asking costs nothing when the source is smaller.
  const requestPx = Math.min(HERO_MAX_PX, Math.round(width * PixelRatio.get()));

  // Scrolling up needs no compensation now — the layer is screen-fixed and the
  // list simply covers it. On a downward rubber-band it grows to keep the
  // widening gap filled. Scaling is centre-anchored, so the translate cancels
  // the half that would push the top edge off screen, sending all the growth
  // downward. Height itself can't be animated: scrollY is native-driven and
  // the native animated module only handles transform and opacity.
  const stretch = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [-height, 0],
          outputRange: [height / 2, 0],
          extrapolateLeft: 'extend' as const,
          extrapolateRight: 'clamp' as const,
        }),
      },
      {
        scale: scrollY.interpolate({
          inputRange: [-height, 0],
          outputRange: [2 * HERO_STRETCH_SLOP, 1],
          extrapolateLeft: 'extend' as const,
          extrapolateRight: 'clamp' as const,
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.heroBackdrop, { height }, stretch]} pointerEvents="none">
      {/* expo-image cross-fades on source change, which is the carousel transition */}
      <Image
        source={{ uri: Jellyfin.imageUrl(item.Id, tag, imageType, requestPx) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
      />
      {/* Inside the transform so it stretches with the image — a fixed shade
          would leave unshaded edges on a downward pull. */}
      <View style={styles.heroShade} />
      <LinearGradient
        colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.45)', 'transparent']}
        locations={[0, 0.55, 1]}
        style={[StyleSheet.absoluteFill, { height: topInset + 64, bottom: undefined }]}
      />
      <LinearGradient
        colors={['transparent', colors.bg]}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Transparent counterpart that rides in the list header: it owns the swipe,
 * the title block and the dots, while HeroBackdrop paints behind it.
 */
function HeroOverlay({ items, height, index, onIndex }: {
  items: JellyfinItem[];
  height: number;
  index: number;
  onIndex: (i: number) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<JellyfinItem>>(null);
  const dragging = useRef(false);
  const focused = useIsFocused();

  // Auto-advance, held while a finger is down so it never yanks mid-swipe.
  // Depending on index restarts the timer whenever the page changes, so a
  // manual swipe also gets a full dwell before the next auto-advance.
  //
  // Stopped while the tab is not focused. The carousel kept advancing off
  // screen otherwise - scrolling a list nobody is looking at, and leaving the
  // hero on a different item than the one you left it on.
  useEffect(() => {
    if (!focused || items.length < 2) return;
    const id = setInterval(() => {
      if (dragging.current) return;
      const next = (index + 1) % items.length;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      onIndex(next);
    }, HERO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [focused, items.length, width, index, onIndex]);

  return (
    <View style={[styles.heroOverlay, { height }]}>
      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={i => i.Id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollBeginDrag={() => { dragging.current = true; }}
        onMomentumScrollEnd={e => {
          dragging.current = false;
          onIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        style={styles.transparent}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            style={{ width, height }}
            onPress={() => router.push(`/item/${item.Id}`)}
          >
            <View style={styles.heroBody}>
              <Text style={styles.heroLabel}>{t('library.featured')}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{item.Name}</Text>
              <View style={styles.heroPillRow}>
                {item.ProductionYear ? (
                  <View style={styles.heroPill}><Text style={styles.heroPillText}>{item.ProductionYear}</Text></View>
                ) : null}
                <View style={styles.heroPill}><Text style={styles.heroPillText}>{item.Type}</Text></View>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
      {items.length > 1 ? (
        <View style={styles.heroDots} pointerEvents="none">
          {items.map((it, i) => (
            <View key={it.Id} style={[styles.heroDot, i === index && styles.heroDotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ContinueWatchingRow({ items, title }: { items: JellyfinItem[]; title: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={i => i.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        renderItem={({ item }) => <ResumeCard item={item} />}
      />
    </View>
  );
}

function ResumeCard({ item }: { item: JellyfinItem }) {
  const backdrop = item.BackdropImageTags?.[0];
  const primary = item.ImageTags?.Primary;
  const tag = backdrop ?? primary;
  const imageType: 'Backdrop' | 'Primary' = backdrop ? 'Backdrop' : 'Primary';

  const progress =
    item.UserData?.PlaybackPositionTicks && item.RunTimeTicks
      ? Math.min(1, item.UserData.PlaybackPositionTicks / item.RunTimeTicks)
      : 0;

  const label =
    item.Type === 'Episode' && item.SeriesId && item.ParentIndexNumber != null && item.IndexNumber != null
      ? `S${item.ParentIndexNumber} · E${item.IndexNumber}`
      : item.ProductionYear
        ? String(item.ProductionYear)
        : '';

  return (
    <Link href={`/item/${item.Id}`} asChild>
      <TouchableOpacity style={styles.resumeCard} activeOpacity={0.8}>
        <View style={styles.resumeImageWrap}>
          <Image
            source={{ uri: Jellyfin.imageUrl(item.Id, tag, imageType, 500) }}
            style={styles.resumeImage}
            contentFit="cover"
            transition={200}
          />
          {progress > 0 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          ) : null}
        </View>
        <Text style={styles.resumeTitle} numberOfLines={1}>{item.Name}</Text>
        {label ? <Text style={styles.resumeMeta}>{label}</Text> : null}
      </TouchableOpacity>
    </Link>
  );
}

function LibraryRow({ lib }: { lib: LibraryItem }) {
  const { t } = useTranslation();
  const count = lib.total || lib.items.length;
  return (
    <View style={styles.section}>
      {/* The whole header is the affordance: the row is a sample of the newest
          titles, and this is how the rest of the library is reached. */}
      <Link
        href={{ pathname: '/library/[id]', params: { id: lib.view.Id, name: lib.view.Name } }}
        asChild
      >
        <TouchableOpacity
          style={styles.sectionHeader}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${lib.view.Name}, ${t('library.seeAll')}`}
        >
          <Text style={styles.sectionTitle}>{lib.view.Name}</Text>
          <Text style={styles.sectionCount}>{count}</Text>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            tintColor={colors.textDim}
            size={13}
          />
        </TouchableOpacity>
      </Link>
      <FlatList
        horizontal
        data={lib.items}
        keyExtractor={i => i.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        renderItem={({ item }) => <PosterCard item={item} />}
      />
    </View>
  );
}

function PosterCard({ item }: { item: JellyfinItem }) {
  const tag = item.ImageTags?.Primary;
  return (
    <Link href={`/item/${item.Id}`} asChild>
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        <Image
          source={{ uri: Jellyfin.imageUrl(item.Id, tag) }}
          style={styles.poster}
          contentFit="cover"
          transition={200}
        />
        <Text style={styles.cardTitle} numberOfLines={1}>{item.Name}</Text>
        {item.ProductionYear ? <Text style={styles.cardYear}>{item.ProductionYear}</Text> : null}
      </TouchableOpacity>
    </Link>
  );
}

const HERO_HEIGHT = 360;
const RESUME_WIDTH = 200;
const RESUME_HEIGHT = 115;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  errorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 150,
  },
  errorIcon: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  errorTitle: { ...type.h1, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  errorBody: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  // The address the request could not reach. Dim on purpose: it is for the
  // person debugging their own server, not the headline.
  errorDetail: { ...type.small, color: colors.textDim, textAlign: 'center', marginTop: spacing.md },
  retry: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    // Pinned height and centring so swapping the label for the spinner does
    // not resize the button mid-tap.
    minHeight: 48,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { ...type.bodyStrong, color: colors.accentContrast },

  heroShade: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: `rgba(0,0,0,${HERO_SHADE})`,
  },
  // screen-fixed layer behind the list; height is applied inline
  heroBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bgElevated },
  // transparent twin inside the list, carrying the swipe, title and dots
  heroOverlay: { width: '100%', marginBottom: spacing.xl, backgroundColor: 'transparent' },
  transparent: { backgroundColor: 'transparent' },
  opaque: { backgroundColor: colors.bg },
  listFooter: { height: 150 },
  heroDots: {
    position: 'absolute',
    bottom: spacing.xl + spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  heroDotActive: { backgroundColor: colors.text, width: 18 },
  heroBody: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xl },
  heroLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  heroTitle: { ...type.display, color: colors.text, marginBottom: spacing.md },
  heroPillRow: { flexDirection: 'row', gap: spacing.sm },
  heroPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  heroPillText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },

  section: { marginBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { ...type.h2, color: colors.text },
  sectionCount: { ...type.small, color: colors.textDim },

  resumeCard: { width: RESUME_WIDTH },
  resumeImageWrap: {
    width: RESUME_WIDTH,
    height: RESUME_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  resumeImage: { width: '100%', height: '100%' },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressFill: { height: '100%', backgroundColor: colors.text },
  resumeTitle: { marginTop: spacing.sm, ...type.small, color: colors.text },
  resumeMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  card: { width: 130 },
  poster: {
    width: 130,
    height: 195,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cardTitle: { marginTop: spacing.sm, ...type.small, color: colors.text },
  cardYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
