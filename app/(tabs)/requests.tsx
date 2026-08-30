import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import * as Push from '@/api/push';
import { getJellyfinUrl } from '@/config';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/date';
import { formatPercent } from '@/lib/percent';
import { requestState, statePercent } from '@/lib/requests';
import { loadPrefs } from '@/store/prefs';
import { getSeerrError } from '@/store/seerrStatus';
import { type JellyseerrRequest } from '@/types';
import { colors, radius, spacing, type as t } from '@/theme';

type EnrichedRequest = JellyseerrRequest & {
  details: Jellyseerr.MediaDetails | null;
  /** still from the lowest requested season; null for movies and on failure */
  seasonArt: string | null;
};

/** Requested seasons, specials dropped, lowest first. */
function requestedSeasons(r: JellyseerrRequest): number[] {
  return (r.seasons ?? [])
    .map(s => s.seasonNumber)
    .filter(n => n > 0)
    .sort((a, b) => a - b);
}

/** Matches the Library: long enough that tab-flicking does not refetch. */
const REFRESH_AFTER_MS = 5000;

export default function RequestsScreen() {
  const router = useRouter();
  const { t: tr } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const scrollY = useRef(new Animated.Value(0)).current;
  const { state } = useAuth();
  const signedIn = state.status === 'signed-in';

  /**
   * jellylab-push's view of the download queues.
   *
   * Jellyseerr carries a queue on each request already, but it asks Sonarr for
   * only the first page of it - and Sonarr queues one row per episode, so a
   * single season pack fills that page and hides everything behind it. This
   * service pages through the whole thing.
   *
   * Null until it answers, and null again if it cannot: the service is
   * optional, its URL may never have been set, and the screen has to work
   * without it exactly as it did before.
   */
  const [downloads, setDownloads] = useState<Push.Downloads | null>(null);
  const [items, setItems] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const loadedAt = useRef(0);

  /**
   * `silent` keeps the poll invisible. loading drives the RefreshControl, so
   * without it every 5-second tick flashed the pull-to-refresh spinner - which
   * looks like the list is reloading when only a percentage moved.
   */
  const load = useCallback(async (silent = false) => {
    // A silent load never competes with one already running. On mount the
    // focus effect fires alongside the mount effect, and without this the tab
    // fetched everything twice before it had drawn once.
    if (silent && inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const raw = await Jellyseerr.listRequests('all');
      const enriched = await Promise.all(
        raw.map(async r => {
          // Lowest season, so a [1] card and a [2][3] card of the same series
          // never land on the same image. Cached in the api layer, so the
          // 5-second poll does not refetch it.
          const seasons = requestedSeasons(r);
          const [details, seasonArt] = await Promise.all([
            Jellyseerr.getMediaDetails(r.media.mediaType, r.media.tmdbId),
            seasons.length > 0 ? Jellyseerr.getSeasonArt(r.media.tmdbId, seasons[0]) : null,
          ]);
          return { ...r, details, seasonArt };
        })
      );
      setItems(enriched);
      setError(null);
      console.log(
        `[jellylab] requests: ${enriched.map(r => `${r.media.mediaType}:${r.media.tmdbId}`).join(' ')}`,
      );

      /*
       * Asked for after the list rather than with it, and never allowed to
       * break it: this is a nicety on top of a screen that has to render
       * whether or not the homelab service is reachable.
       */
      try {
        const { pushUrl } = await loadPrefs();
        const url = Push.resolveUrl(pushUrl, getJellyfinUrl());
        if (!url) {
          console.log('[jellylab] downloads: no url (jellyfin url not resolved yet)');
          setDownloads(null);
          return;
        }
        const d = await Push.downloads(url);
        console.log(
          `[jellylab] downloads: ${url}` +
          ` tv=${Object.keys(d.tv ?? {}).join(',') || 'none'}` +
          ` movies=${Object.keys(d.movies ?? {}).join(',') || 'none'}`,
        );
        setDownloads(d);
      } catch (e) {
        console.log(`[jellylab] downloads failed — ${e instanceof Error ? e.message : String(e)}`);
        setDownloads(null);
      }
    } catch (e) {
      // This used to be try/finally with no catch, so a rejection escaped as an
      // unhandled promise and showed up as a red screen at launch. The root
      // layout sends a signed-out user to /login from an effect, which means
      // this tab mounts and runs its own effect first - reliably hitting an
      // absent session before the redirect lands.
      // A recorded sign-in failure is the more useful message: it names the
      // address that could not be reached, where the generic strings can only
      // say that something is wrong.
      setError(
        getSeerrError() ??
          (e instanceof Jellyseerr.NotAuthenticatedError
            ? tr('requests.signedOut')
            : tr('requests.unavailable'))
      );
      setItems([]);
    } finally {
      inFlight.current = false;
      loadedAt.current = Date.now();
      if (!silent) setLoading(false);
    }
  }, [tr]);

  // Nothing to ask Jellyseerr for until there is a session to ask with.
  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    load();
  }, [signedIn, load]);

  /**
   * Refetch when the tab is opened again, the same way the Library does.
   *
   * Approve something in Jellyseerr, or let a download finish while you are on
   * another tab, and this list was showing whatever was true when it first
   * mounted. Silent, so returning to the tab does not flash the refresh
   * spinner, and skipped if it just loaded.
   */
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      if (Date.now() - loadedAt.current > REFRESH_AFTER_MS) load(true);
    }, [signedIn, load])
  );

  /**
   * Refresh while anything is actually in the download queue, so the bars move
   * rather than showing whatever was true when the tab opened. Gated on there
   * being something to watch: with nothing downloading this costs nothing, and
   * it stops on its own once the last one finishes.
   */
  const anyDownloading =
    items.some(r => (r.media.downloadStatus ?? []).length > 0) ||
    Object.keys(downloads?.tv ?? {}).length > 0 ||
    Object.keys(downloads?.movies ?? {}).length > 0;
  useEffect(() => {
    if (!anyDownloading) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') load(true);
    }, 5000);
    return () => clearInterval(id);
  }, [anyDownloading, load]);

  if (loading && items.length === 0) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
        <TabHeader title={tr('tabs.requests')} scrollY={scrollY} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Animated.FlatList
        data={items}
        keyExtractor={(r: EnrichedRequest) => String(r.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.text} progressViewOffset={headerHeight} />}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        ListHeaderComponent={<View style={{ height: headerHeight }} />}
        renderItem={({ item }: { item: EnrichedRequest }) => (
          <RequestCard r={item} downloads={downloads} onOpen={() => router.push(`/tmdb/${item.media.mediaType}/${item.media.tmdbId}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 150 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{error ?? tr('requests.empty')}</Text>
          </View>
        }
      />
      <TabHeader title={tr('tabs.requests')} scrollY={scrollY} />
    </View>
  );
}

function RequestCard({ r, onOpen, downloads }: {
  r: EnrichedRequest;
  onOpen: () => void;
  /** the whole-queue view from jellylab-push, when it answered */
  downloads: Push.Downloads | null;
}) {
  const { t } = useTranslation();

  /*
   * One pill, saying the most specific true thing.
   *
   * It used to be two - the request's state and the media's - which in
   * practice read "Approved · Processing" on nearly every card. Approval is
   * automatic for the owner and near-automatic for a guest, so the word was
   * everywhere and meant nothing; and "Processing" covered no release existing,
   * downloading at speed, and a finished download Sonarr refuses to import.
   */
  const state = requestState(r, undefined, downloads);
  const available = state.kind === 'available';
  const label =
    state.kind === 'searching' && state.days > 0
      ? t('requests.state.searchingDays', { count: state.days })
      : t(`requests.state.${state.kind}`, { defaultValue: '' });
  const pills = label ? [label] : [];

  // Both sources read their figures from qBittorrent by way of Sonarr or
  // Radarr, so either way this is the percentage the torrent client shows.
  // jellylab-push is preferred because it reads the whole queue; Jellyseerr
  // sees only its first page. See lib/requests.
  const queue = r.media.downloadStatus ?? [];
  /*
   * The figure comes from whichever source answered, which is the whole point:
   * requestProgress already decided between them, so recomputing it from
   * Jellyseerr's queue here would throw that away - and did. The state said
   * "downloading" while the bar drew from an empty array and rendered nothing.
   *
   * Floored and given a decimal near the end - see lib/percent. Rounding is
   * what made a download at 99.7% announce itself as finished.
   */
  const fraction = statePercent(state);
  const pct = fraction != null ? Math.round(fraction * 100) : null;
  const pctLabel = formatPercent(fraction);
  // one entry has a real ETA; a season pack split over many does not
  const timeLeft = queue.length === 1 ? queue[0].timeLeft : undefined;
  // Seerr files one request per season selection, so a series can appear
  // several times. Without showing which seasons each covers the rows look
  // like duplicates of each other.
  const seasonNumbers = requestedSeasons(r);

  const title = r.details?.title ?? `TMDB ${r.media.tmdbId}`;
  const year = r.details?.year;
  // Season art first so repeat requests of one series read as different rows;
  // the series backdrop covers movies and anything with no still.
  const backdrop = r.seasonArt ?? Jellyseerr.backdropUrl(r.details?.backdropPath);
  const poster = Jellyseerr.posterUrl(r.details?.posterPath, 'w300');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      // The pills carry the state - approved, available, downloading - and a
      // screen reader would otherwise announce the title and nothing else.
      accessibilityLabel={[title, year, ...pills].filter(Boolean).join(', ')}
    >
      {backdrop ? (
        <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated }]} />
      )}
      {/* Episode stills are far brighter and busier than a backdrop - some are
          lit daylight exteriors - so the middle stop sits darker than it needs
          to for backdrops alone. The title and pills sit in that band. */}
      <LinearGradient
        colors={['rgba(10,10,10,0.88)', 'rgba(10,10,10,0.68)', 'rgba(10,10,10,0.88)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.body}>
        {poster ? (
          <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.poster, { backgroundColor: colors.surface }]} />
        )}
        <View style={styles.info}>
          {year ? <Text style={styles.year}>{year}</Text> : null}
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {seasonNumbers.length > 0 ? (
              <View style={styles.seasonRow}>
                {seasonNumbers.slice(0, 4).map(n => (
                  <View key={n} style={styles.seasonChip}>
                    <Text style={styles.seasonChipText}>{n}</Text>
                  </View>
                ))}
                {seasonNumbers.length > 4 ? (
                  <Text style={styles.seasonMore}>+{seasonNumbers.length - 4}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {/* Two pills: how the request went, and where the media is now.
              One pill now, saying the most specific true thing - see
              requestState. How long a search has been running is in the label
              itself, so it no longer needs a line of its own underneath. */}
          <View style={styles.pillRow}>
            {pills.map((label, i) => (
              <View key={label} style={[styles.pill, available && i === 0 && styles.pillAvailable]}>
                <Text style={styles.pillText}>{label}</Text>
              </View>
            ))}
          </View>
          {pct !== null ? (
            <View style={styles.progressWrap}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {pctLabel}{timeLeft && timeLeft !== '00:00:00' ? ` · ${timeLeft}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.by}>
              {r.requestedBy.displayName} · {formatDate(r.createdAt)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const CARD_HEIGHT = 140;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.bg },
  empty: { ...t.body, color: colors.textDim },

  card: {
    height: CARD_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  body: { flex: 1, flexDirection: 'row', padding: spacing.md, gap: spacing.md, alignItems: 'center' },
  poster: {
    width: 80,
    height: CARD_HEIGHT - spacing.md * 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  info: { flex: 1, gap: spacing.xs },
  year: { ...t.caption, color: colors.textMuted, textTransform: 'uppercase' },
  title: { ...t.bodyStrong, color: colors.text, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  seasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seasonChip: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    alignItems: 'center',
  },
  seasonChipText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  seasonMore: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  pillAvailable: { backgroundColor: colors.successTint, borderColor: colors.successBorder },
  pillText: { color: colors.text, ...t.caption, textTransform: 'uppercase' },
  waiting: { fontSize: 12, fontWeight: '600', color: colors.pink },
  by: { ...t.small, color: colors.textDim, marginTop: spacing.xs },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  barTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.successBorder },
  progressText: { ...t.caption, color: colors.textMuted, minWidth: 34, textAlign: 'right' },
});
