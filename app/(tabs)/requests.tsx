import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import * as Push from '@/api/push';
import { getJellyfinUrl } from '@/config';
import { ReleaseCheck } from '@/components/ReleaseCheck';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/date';
import { formatPercent } from '@/lib/percent';
import { qualityFromLabel } from '@/lib/quality';
import { attention, requestState, statePercent } from '@/lib/requests';
import { averageSpeed, formatEta } from '@/lib/download';
import { formatBytes } from '@/lib/bytes';
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

  /**
   * Where jellylab-push is, kept so a card can ask it something directly.
   *
   * Resolved once alongside the download poll rather than per card: it is the
   * Jellyfin URL with the port swapped, and every card would derive the same
   * answer.
   */
  const [pushUrl, setPushUrl] = useState('');

  /**
   * The request whose releases are being looked at, if any.
   *
   * One sheet for the whole screen rather than one per card - the list is
   * virtualised, and a Modal inside a recycled row is both wasteful and prone
   * to reopening on a scroll.
   */
  const [checking, setChecking] = useState<EnrichedRequest | null>(null);

  /** Why rejected titles were rejected, keyed by TMDB id. See store/prefs. */
  const [reasons, setReasons] = useState<Record<string, string>>({});
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
        const prefs = await loadPrefs();
        setReasons(prefs.rejectionReasons ?? {});
        const url = Push.resolveUrl(prefs.pushUrl, getJellyfinUrl());
        setPushUrl(url);
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
  /*
   * Sorted by how much attention each wants.
   *
   * Two thirds of these are available, so the list was mostly the state nobody
   * acts on with the few that need something scattered through it. Ties keep
   * Jellyseerr's order, which is newest first, so within a group the recent
   * ones lead.
   */
  const ordered = useMemo(() => {
    const scored = items.map((r, i) => ({ r, i, a: attention(requestState(r, undefined, downloads)) }));
    scored.sort((x, y) => x.a - y.a || x.i - y.i);
    return scored.map(x => x.r);
  }, [items, downloads]);

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
        data={ordered}
        keyExtractor={(r: EnrichedRequest) => String(r.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.text} progressViewOffset={headerHeight} />}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        ListHeaderComponent={<View style={{ height: headerHeight }} />}
        renderItem={({ item }: { item: EnrichedRequest }) => (
          <RequestCard
            r={item}
            downloads={downloads}
            onOpen={() => router.push(`/tmdb/${item.media.mediaType}/${item.media.tmdbId}`)}
            onCheck={pushUrl ? () => setChecking(item) : undefined}
            rejectionReason={reasons[String(item.media.tmdbId)]}
          />
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
      {checking ? (
        <ReleaseCheck
          // Fresh per request, so opening a second card never shows the first
          // card's answer while the new search runs.
          key={checking.id}
          visible
          onClose={() => setChecking(null)}
          url={pushUrl}
          tmdbId={checking.media.tmdbId}
          mediaType={checking.media.mediaType === 'movie' ? 'movie' : 'tv'}
          // Sonarr searches a season or an episode, never a whole series. A
          // Seerr request is filed per season selection, so the lowest one it
          // covers is the season this row is actually about.
          season={requestedSeasons(checking)[0]}
          title={checking.details?.title ?? String(checking.media.tmdbId)}
          requestId={checking.id}
          // Which of the two actions the sheet offers: reject, or undo it.
          // Declining a declined request does nothing, and offering it implies
          // otherwise.
          isRejected={requestState(checking, undefined, downloads).kind === 'declined'}
          onRejected={(reason) => {
            setReasons(prev => ({ ...prev, [String(checking.media.tmdbId)]: reason }));
            setChecking(null);
            load(true);
          }}
          onUnrejected={() => {
            setReasons(prev => {
              const next = { ...prev };
              delete next[String(checking.media.tmdbId)];
              return next;
            });
            setChecking(null);
            load(true);
          }}
        />
      ) : null}
    </View>
  );
}

function RequestCard({ r, onOpen, onCheck, downloads, rejectionReason }: {
  r: EnrichedRequest;
  onOpen: () => void;
  /**
   * Ask the server what could be grabbed. Absent when jellylab-push has no
   * URL yet, which is the one case where there is nobody to ask.
   */
  onCheck?: () => void;
  /** the whole-queue view from jellylab-push, when it answered */
  downloads: Push.Downloads | null;
  /** why this was rejected, if it was and a reason was noted */
  rejectionReason?: string;
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
  /**
   * Which of the five tones a state wears.
   *
   * Green only for arrived, so it never appears on something still in flight;
   * blue-grey for the ordinary working states, which is most of them; yellow
   * for waiting on time or a person; orange for wrong but recoverable; red for
   * over. Colour therefore means "how much attention", not decoration.
   */
  const tone =
    state.kind === 'available' || state.kind === 'partial' ? 'good'
    : state.kind === 'declined' || state.kind === 'failed' ? 'bad'
    : state.kind === 'stalled' || (state.kind === 'searching' && state.overdue) ? 'warn'
    : state.kind === 'pending' || state.kind === 'unreleased' || state.kind === 'airing' ? 'wait'
    : 'neutral';

  const available = state.kind === 'available';
  const rejected = state.kind === 'declined' || state.kind === 'failed';
  /*
   * A search that has found nothing for days should stop sounding busy.
   *
   * "Looking for it" is true on the first day and misleading on the fifteenth:
   * Radarr and Sonarr are not working through a queue, they are running the
   * same query on a schedule and getting the same nothing. Khatron Ke Khiladi
   * S15 is the case - every episode aired, none was ever posted, and the card
   * would have said "looking" indefinitely.
   *
   * Overdue is time-based, so it claims no more than it knows: nothing has
   * arrived yet. Tapping through runs a real search and says whether anything
   * exists at all.
   */
  /*
   * One pill, one fact.
   *
   * The day counters went: the card already says "talha - 30-08-2026" two
   * lines below, so "Nothing found - 15d" was the same fact twice, and the
   * pill is the place with least room for it. The airing pill lost its "next"
   * date for the same reason the unreleased ones were merged - a count and a
   * date in one pill is two answers to one question.
   */
  const label =
    state.kind === 'searching'
      ? t(state.overdue ? 'requests.state.nothingFound' : 'requests.state.searching')
      : state.kind === 'unreleased'
        ? state.date
          ? t('requests.state.expectedOn', { date: formatDate(state.date) })
          : t('requests.state.expected')
        : state.kind === 'airing'
          // Nothing aired yet is not part-way through: "Airing 0/18" reads as
          // a season underway that has somehow produced nothing.
          ? state.aired === 0
            ? state.next
              ? t('requests.state.expectedOn', { date: formatDate(state.next) })
              : t('requests.state.expected')
            : t('requests.state.airing', { aired: state.aired, total: state.total })
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

  /*
   * The detail line under the bar.
   *
   * Only for something actually being fetched: on an available or unreleased
   * request there is nothing to say, and a row of dashes is worse than a blank.
   *
   * Speed is an average since it started rather than a live reading - see
   * lib/download for why that is both easier and more useful. Each piece is
   * dropped rather than faked when it cannot be known, so the line shortens
   * instead of lying.
   */
  const live = state.kind === 'downloading' || state.kind === 'stalled'
    ? (r.media.mediaType === 'movie' ? downloads?.movies : downloads?.tv)?.[String(r.media.tmdbId)]
    : undefined;
  /*
   * Live speed when jellylab-push could read qBittorrent, an average since the
   * download started otherwise.
   *
   * The average is not a worse number, it is a different one - a torrent that
   * has held 2MB/s for ten hours is a different situation from one that
   * briefly touched 20. But when the live figure exists it is what a person
   * means by "how fast is it going", and it is what qBittorrent shows.
   */
  const speed = live
    ? live.liveSpeed ?? averageSpeed(live.size, live.sizeLeft, live.added)
    : null;

  // Connected peers over what the tracker claims. The gap is the whole story
  // on a dead swarm: Bin Roye sat at 0 of 14 for hours while reporting a
  // perfectly healthy-looking seeder count.
  const seeds = live?.seeders != null
    ? live.seedersTotal != null && live.seedersTotal !== live.seeders
      ? `${live.seeders}/${live.seedersTotal}`
      : String(live.seeders)
    : null;

  /*
   * A stalled download says why instead of how fast.
   *
   * Sonarr puts the reason in errorMessage - "The download is stalled with no
   * connections" - and while it is stalled the size and the average speed are
   * both describing a thing that is not happening. One line, so the useful
   * sentence takes it.
   */
  const stalledWhy = state.kind !== 'stalled'
    ? null
    // Seed counts say it shorter and with a number. Sonarr's sentence - "The
    // download is stalled with no connections" - is thirty-nine characters
    // longer than the card is wide, so it arrived truncated to "...no
    // connecti" and the reader had to already know the ending. "0 of 14 seeds"
    // fits, and says how dead the swarm is rather than only that it is.
    : live?.seeders != null && live?.seedersTotal != null
      ? t('requests.seedsOf', { seeders: live.seeders, total: live.seedersTotal })
      : live?.error ?? null;

  /*
   * The quality, as a pill beside the state rather than buried in the detail
   * line.
   *
   * Translated through the same helper the item screen uses, so a request and
   * the thing it becomes are described identically - and in words from a
   * television box rather than from Radarr: "Full HD", not "WEBDL-1080p".
   */
  const qualityKey = qualityFromLabel(live?.quality);

  /*
   * A part-way season says what is still to come.
   *
   * The pill says you can watch it; this says how much of it there is and
   * when the rest lands - which is what "Airing 5/8" was trying to convey
   * from a place with no room for the date.
   */
  const airingDetail = state.kind === 'partial' && state.airing
    ? t('requests.airingRest', {
        aired: state.airing.aired,
        total: state.airing.total,
        date: formatDate(state.airing.next),
      })
    : null;

  const detail = airingDetail
    ? airingDetail
    : rejected
    // Jellyseerr records that it was declined and nothing about why, so the
    // reason comes from whatever was noted when it was rejected here.
    ? rejectionReason ?? null
    : stalledWhy
    ? stalledWhy
    : live
      ? [
          live.size ? formatBytes(live.size) : null,
          speed != null ? `${formatBytes(speed)}/s` : null,
          seeds != null ? t('requests.seeds', { seeds }) : null,
          // How long it has been going is history; how long is left is the
          // thing anyone reads a progress line to find out.
          formatEta(live.eta),
          live.indexer?.replace(/\s*\(Prowlarr\)\s*$/, '') ?? null,
        ].filter(Boolean).join(' · ')
      : null;
  /*
   * Whether asking the server would tell you anything.
   *
   * Only for the states where "searching" is hiding two different situations:
   * a release exists and the choosing is going wrong, or no release the
   * profile permits exists at all and it will search forever. Everywhere else
   * the state already is the explanation.
   */
  const canCheck = onCheck != null
    && (state.kind === 'searching' || state.kind === 'stalled'
        || state.kind === 'importing' || rejected);

  const pct = fraction != null ? Math.round(fraction * 100) : null;
  const pctLabel = formatPercent(fraction);
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
        // Darker than it was: the backdrop is decoration behind text, and at
        // the old weights a bright still made the title and pill hard to read.
        colors={['rgba(10,10,10,0.94)', 'rgba(10,10,10,0.82)', 'rgba(10,10,10,0.94)']}
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
              <View key={label} style={[styles.pill, TONE[tone]]}>
                <Text style={styles.pillText}>{label}</Text>
              </View>
            ))}
            {/* Only while something is being fetched. Once a title is in the
                library its quality belongs on the item screen, which reads it
                from the file itself rather than from whatever was grabbed. */}
            {qualityKey ? (
              <View style={[styles.pill, styles.pillQuality]}>
                <Text style={styles.pillText}>{t(qualityKey)}</Text>
              </View>
            ) : null}
          </View>
          {pct !== null ? (
            <>
            <View style={styles.progressWrap}>
              <View style={styles.barTrack}>
                <View style={[
                  styles.barFill,
                  { width: `${pct}%` },
                  // A stalled download drawn in the same green as a healthy
                  // one says the wrong thing at a glance, which is the only
                  // glance a list gets.
                  state.kind === 'stalled' && styles.barFillStalled,
                ]} />
              </View>
              <Text style={styles.progressText}>
                {pctLabel}
              </Text>
            </View>
            {detail ? (
              // Two lines when it is a sentence rather than a row of figures:
              // a truncated explanation explains nothing.
              <Text style={styles.detail} numberOfLines={stalledWhy ? 2 : 1}>{detail}</Text>
            ) : null}
            </>
          ) : detail ? (
            <Text style={styles.detail} numberOfLines={2}>{detail}</Text>
          ) : (
            <Text style={styles.by}>
              {r.requestedBy.displayName} · {formatDate(r.createdAt)}
            </Text>
          )}
          {/*
            Offered only where the answer would change what you do. On a
            request that is downloading, or already available, or waiting on a
            broadcast date, there is nothing to diagnose - the state is the
            explanation. On one that is searching or stuck it is the difference
            between "wait" and "this will never finish".
          */}
          {canCheck ? (
            <TouchableOpacity onPress={onCheck} hitSlop={8}>
              {/* A rejected request is not stuck - it was closed on purpose,
                  and the reason is already on the card above. What is still
                  worth offering is another look, because a dead swarm can come
                  back and a release that did not exist last week may now. */}
              <Text style={styles.check}>
                {t(rejected ? 'requests.check.actionAgain' : 'requests.check.action')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Room for the detail line under the bar, and for the release-check action on
// a request that is stuck. Fixed rather than measured because the list is
// virtualised and a varying height makes it jump while scrolling - which means
// the tallest arrangement sets it for every card.
const CARD_HEIGHT = 172;


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
  /*
   * Quieter than the rest, deliberately.
   *
   * Two thirds of the list is available, and colour is only worth anything if
   * it marks what needs looking at. A saturated green on the majority state
   * made the exceptions harder to find, which is the opposite of the point.
   */
  pillGood: { backgroundColor: 'transparent', borderColor: colors.successBorder },
  pillNeutral: { backgroundColor: colors.pillNeutralTint, borderColor: colors.pillNeutralBorder },
  pillWait: { backgroundColor: colors.pillWaitTint, borderColor: colors.pillWaitBorder },
  pillWarn: { backgroundColor: colors.pillWarnTint, borderColor: colors.pillWarnBorder },
  pillBad: { backgroundColor: colors.pillBadTint, borderColor: colors.pillBadBorder },
  // Opaque like the available pill, and for the same reason: these sit over
  // poster artwork that can be white or near-black in the same list.
  pillText: { color: colors.text, ...t.caption, textTransform: 'uppercase' },
  waiting: { fontSize: 12, fontWeight: '600', color: colors.pink },
  by: { ...t.small, color: colors.textDim, marginTop: spacing.xs },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  barTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.successBorder },
  // Muted rather than alarming: stalled is not broken, and a torrent that
  // has lost its peers usually finds them again.
  barFillStalled: { backgroundColor: colors.textDim },
  progressText: { ...t.caption, color: colors.textMuted, minWidth: 34, textAlign: 'right' },
  // Legible rather than decorative: this is the line you read to find out how
  // a download is going, so it carries weight and sits at muted rather than dim.
  detail: { ...t.caption, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  // An action, so it reads as tappable rather than as one more fact about
  // the request - everything else in this column is a statement.
  check: { ...t.caption, color: colors.textMuted, marginTop: spacing.xs, textDecorationLine: 'underline' },
  // Quieter than the state pill beside it: what is happening matters more
  // than what it will look like.
  pillQuality: { backgroundColor: 'transparent', borderColor: colors.border },
});

/**
 * Tone to style.
 *
 * Declared after the stylesheet because it names entries in it - and kept as
 * one map so the five tones are visible together rather than scattered through
 * a chain of conditionals in the render.
 */
const TONE = {
  good: styles.pillGood,
  neutral: styles.pillNeutral,
  wait: styles.pillWait,
  warn: styles.pillWarn,
  bad: styles.pillBad,
} as const;
