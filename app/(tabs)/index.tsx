import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, PixelRatio, RefreshControl, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem, JellyfinView } from '@/types';

type LibraryItem = { view: JellyfinView; items: JellyfinItem[] };

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

export default function LibraryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const { state } = useAuth();
  const [resume, setResume] = useState<JellyfinItem[]>([]);
  const [latest, setLatest] = useState<JellyfinItem[]>([]);
  const [libs, setLibs] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  async function load() {
    if (state.status !== 'signed-in') return;
    setLoading(true);
    try {
      const [views, resumeItems] = await Promise.all([
        Jellyfin.getViews(state.auth.userId),
        Jellyfin.getResumeItems(state.auth.userId, 12),
      ]);
      const filtered = views.filter(v => v.CollectionType === 'movies' || v.CollectionType === 'tvshows');
      const withItems = await Promise.all(
        filtered.map(async view => ({
          view,
          items: await Jellyfin.getItems(state.auth.userId, view.Id, 20),
        }))
      );
      const latestItems = (
        await Promise.all(
          filtered.map(view => Jellyfin.getLatestItems(state.auth.userId, view.Id, 6).catch(() => []))
        )
      ).flat();
      setResume(resumeItems);
      setLatest(latestItems);
      setLibs(withItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [state.status]);

  if (state.status !== 'signed-in' || (loading && libs.length === 0 && resume.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} progressViewOffset={headerHeight} />}
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
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFill, { height: topInset + 40, bottom: undefined }]}
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

  // Auto-advance, held while a finger is down so it never yanks mid-swipe.
  // Depending on index restarts the timer whenever the page changes, so a
  // manual swipe also gets a full dwell before the next auto-advance.
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => {
      if (dragging.current) return;
      const next = (index + 1) % items.length;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      onIndex(next);
    }, HERO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [items.length, width, index, onIndex]);

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
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{lib.view.Name}</Text>
        <Text style={styles.sectionCount}>{lib.items.length}</Text>
      </View>
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
