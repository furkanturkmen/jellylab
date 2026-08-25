import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Modal, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VLCPlayer } from 'react-native-vlc-media-player';
import GoogleCast, { useCastState, useRemoteMediaClient } from 'react-native-google-cast';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';

import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { ButtonRow, CircleButton, PrimaryButton } from '@/components/AppleButton';
import { decidePlayback, type Engine, type PlayMode } from '@/player/decide';
import { parseVtt, findActiveCue, type VttCue } from '@/player/vtt';
import { matchesLanguage } from '@/player/lang';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/store/auth';
import { loadPrefs, savePrefs, withSubtitleDelay, type Prefs } from '@/store/prefs';
import { formatDate } from '@/lib/date';
import { jellyfinKind, kindKey } from '@/lib/kind';
import { metadataLanguage, plainText, oneLine } from '@/lib/text';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

type PlaybackConfig = {
  url: string;
  engine: Engine;
  mode: PlayMode;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  audioStreams: AudioStream[];
};

/** An audio track as Jellyfin describes it, before VLC has opened the file. */
type AudioStream = { index: number; label: string; language?: string };

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);

  const castClient = useRemoteMediaClient();
  const castState = useCastState();
  const [castPickerOpen, setCastPickerOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const [tmdbArt, setTmdbArt] = useState<{ backdrop?: string; poster?: string }>({});
  /** TMDB's description in the app's language, when it has one. */
  const [localisedOverview, setLocalisedOverview] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      try {
        await GoogleCast.getDiscoveryManager().startDiscovery();
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (state.status !== 'signed-in' || !id) return;
    Jellyfin.getItem(state.auth.userId, id).then(setItem);
  }, [state.status, id]);

  // Fetched here rather than inside the episode list, because the pill above it
  // needs to count them - and counting them is the only way to get the number
  // right. See below.
  useEffect(() => {
    if (state.status !== 'signed-in' || !item || item.Type !== 'Series') return;
    let cancelled = false;
    Jellyfin.getSeasons(state.auth.userId, item.Id)
      .then(list => { if (!cancelled) setSeasons(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state, item]);

  /**
   * Prefer TMDB's own artwork for the two big images on this screen.
   *
   * Same reasoning as the library hero: Jellyfin serves what its scraper saved
   * and re-encodes it on the way out, and this backdrop is the widest image in
   * the app. Jellyseerr proxies TMDB, so there is no key and no new service.
   *
   * Everything here is optional. No TMDB id, no Seerr session, or nothing on
   * TMDB and the screen keeps the server's images, which is what it drew
   * before. Episodes are left alone - their stills would be a lookup each.
   */
  useEffect(() => {
    if (!item) return;
    const tmdb = Jellyfin.tmdbId(item);
    if (!tmdb) return;
    let cancelled = false;
    (async () => {
      const details = await Jellyseerr
        .getMediaDetails(item.Type === 'Movie' ? 'movie' : 'tv', tmdb, metadataLanguage(i18n.language))
        .catch(() => null);
      if (cancelled || !details) return;
      // The server holds one language for a whole library - the anime one here
      // is set to Japanese - and it cannot vary per client. TMDB can, so the
      // description follows the app instead. Empty means TMDB has no
      // translation, and then the server's own text is the better answer.
      setLocalisedOverview(details.overview?.trim() ? details.overview : null);
      setTmdbArt({
        backdrop: details.backdropPath ? `${TMDB_ORIGINAL}${details.backdropPath}` : undefined,
        // The poster is drawn at 140pt, so the original would be a 2000px file
        // scaled down on the device for nothing.
        poster: details.posterPath ? `${TMDB_POSTER}${details.posterPath}` : undefined,
      });
    })();
    return () => { cancelled = true; };
  }, [item, i18n.language]);

  async function play() {
    if (state.status !== 'signed-in' || !item) return;
    const [deviceId, sources, prefs] = await Promise.all([
      getDeviceId(),
      Jellyfin.getPlaybackInfo(state.auth.userId, item.Id).catch(() => []),
      loadPrefs(),
    ]);
    const decision = decidePlayback(sources, prefs.maxBitrateMbps);
    const engine: Engine =
      prefs.preferredEngine === 'native'
        ? 'native'
        : prefs.preferredEngine === 'vlc'
          ? 'vlc'
          : decision.engine;
    const source = sources[0];
    // transcoding needs a MediaSourceId; without one we can only direct play
    const transcoding = decision.mode === 'transcode' && !!source?.Id && !!decision.maxBitrate;
    const mode: PlayMode = transcoding ? 'transcode' : 'direct';
    const url = transcoding
      ? Jellyfin.transcodeUrl(item.Id, source.Id, state.auth.accessToken, deviceId, decision.maxBitrate!)
      : Jellyfin.streamUrl(item.Id, state.auth.accessToken, deviceId);
    const externalSubs = (source?.MediaStreams ?? [])
      .filter(s => s.Type === 'Subtitle' && typeof s.Index === 'number')
      .map(s => ({
        index: s.Index as number,
        label: s.DisplayTitle ?? s.Language ?? `Track ${s.Index}`,
      }));
    // Jellyfin names audio tracks far better than the container does - VLC
    // often reports nothing but "Track 1" - so its labels are carried through
    // and matched to VLC's tracks by position once the file is open.
    const audioStreams = (source?.MediaStreams ?? [])
      .filter(s => s.Type === 'Audio' && typeof s.Index === 'number')
      .map(s => ({
        index: s.Index as number,
        label: s.DisplayTitle ?? s.Language ?? `Track ${s.Index}`,
        language: s.Language,
      }));

    if (castClient) {
      try {
        await castClient.loadMedia({
          mediaInfo: {
            contentUrl: url,
            contentType: transcoding ? 'application/x-mpegURL' : 'video/mp4',
            metadata: {
              type: 'movie',
              title: item.Name,
              images: item.ImageTags?.Primary
                ? [{ url: Jellyfin.imageUrl(item.Id, item.ImageTags.Primary, 'Primary', 600) }]
                : undefined,
            },
          },
          autoplay: true,
        });
        return;
      } catch {
        // fall through to local playback
      }
    }

    setPlayback({ url, engine, mode, mediaSourceId: source?.Id, externalSubs, audioStreams });
  }

  if (!item) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  if (playback) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Player
          config={playback}
          itemId={item.Id}
          delayKey={item.SeriesId ?? item.Id}
          title={item.Name}
          // What the lock screen shows under the title: the series for an
          // episode, the year for a film.
          subtitle={item.Type === 'Episode'
            ? [item.SeriesName, item.ParentIndexNumber != null && item.IndexNumber != null
                ? `S${item.ParentIndexNumber} · E${item.IndexNumber}` : null].filter(Boolean).join(' · ')
            : String(item.ProductionYear ?? '')}
          artworkUri={tmdbArt.poster ?? (item.ImageTags?.Primary
            ? Jellyfin.imageUrl(item.Id, item.ImageTags.Primary, 'Primary', 600)
            : undefined)}
          resumeSeconds={Jellyfin.ticksToSeconds(item.UserData?.PlaybackPositionTicks ?? 0)}
          initialDuration={Jellyfin.ticksToSeconds(item.RunTimeTicks ?? 0)}
          onExit={() => setPlayback(null)}
          onNativeError={() => setPlayback(p => (p ? { ...p, engine: 'vlc' } : p))}
        />
      </>
    );
  }

  const primary = item.ImageTags?.Primary;
  const backdrop = item.BackdropImageTags?.[0];
  const runtimeMin = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : null;

  // Shared with the search results, which were saying TV for the same title
  // this screen called ANIME.
  const kind = t(kindKey(jellyfinKind(item)));

  /**
   * A series that has ended has two years worth showing. One that is still
   * running has one and an en dash, the way every listing writes it.
   */
  const endYear = item.EndDate ? Number(item.EndDate.slice(0, 4)) : null;
  const years = !item.ProductionYear
    ? null
    : item.Type !== 'Series'
      ? String(item.ProductionYear)
      : endYear && endYear !== item.ProductionYear
        ? `${item.ProductionYear}–${endYear}`
        : item.Status === 'Continuing'
          ? `${item.ProductionYear}–`
          : String(item.ProductionYear);

  // For a series the runtime is one episode's, which is worth saying rather
  // than implying - "24m" beside "3 seasons" reads as the season being 24
  // minutes long otherwise.
  //
  // The count comes from the season list, not from ChildCount: Jellyfin counts
  // Specials as a season, so Tokyo Ghoul - three seasons and a specials folder -
  // reported four. Specials are index 0 by convention, which is what makes them
  // separable. ChildCount stands in until the list arrives, so the pill does not
  // appear and then jump.
  const realSeasons = seasons.filter(x => (x?.IndexNumber ?? 0) > 0).length;
  const seasonCount = item.Type !== 'Series'
    ? null
    : realSeasons || (item.ChildCount ?? null);
  const backdropPx = Math.min(HERO_MAX_PX, Math.round(screenWidth * PixelRatio.get()));

  // Grows on a downward pull instead of leaving a black bar above it. Scaling
  // is centre-anchored, so the translate cancels the half that would push the
  // top edge off screen and all the growth goes downward. Clamped on the right
  // so ordinary upward scrolling keeps the existing behaviour.
  // Two translations, added: the rubber-band growth on a downward pull, and a
  // slower drift once the page starts moving up.
  //
  // Without the drift the whole hero - artwork, shade and gradients together -
  // slid up at the speed of the text, so the dark overlay travelled across the
  // screen as a moving band rather than staying where the artwork was. Same
  // treatment as the library hero: a third of the scroll speed, and gone by the
  // time the content has covered where it was.
  const heroRubberBand = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0],
    outputRange: [-HERO_HEIGHT / 2, 0],
    extrapolateLeft: 'extend' as const,
    extrapolateRight: 'clamp' as const,
  });
  const heroDrift = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, HERO_HEIGHT / 3],
    extrapolate: 'clamp' as const,
  });

  const heroStretch = {
    opacity: scrollY.interpolate({
      inputRange: [0, HERO_HEIGHT * 0.55, HERO_HEIGHT * 0.9],
      outputRange: [1, 1, 0],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateY: Animated.add(heroRubberBand, heroDrift),
      },
      {
        scale: scrollY.interpolate({
          inputRange: [-HERO_HEIGHT, 0],
          outputRange: [2 * HERO_STRETCH_SLOP, 1],
          extrapolateLeft: 'extend' as const,
          extrapolateRight: 'clamp' as const,
        }),
      },
    ],
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: '',
          headerShown: true,
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: colors.text,
          gestureEnabled: true,
        }}
      />
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* The hero is extended upward with a matching negative margin so its
            clip box covers the area a downward rubber-band opens. Same layout
            footprint, so the poster's negative marginTop is unaffected. There
            is no RefreshControl on this screen, so nothing is hidden by it. */}
        <View style={styles.hero}>
          {/* Everything that darkens the artwork lives inside the transform
              with it, the way the library hero does.
              Outside it, the shade and the gradients stayed at a fixed offset
              while the picture stretched and drifted underneath - so the image
              slid out from under its own darkening and left a bright band above
              a hard horizontal line. */}
          <Animated.View style={[styles.heroBackdrop, heroStretch]}>
            {backdrop || tmdbArt.backdrop ? (
              <Image
                source={{ uri: tmdbArt.backdrop ?? Jellyfin.imageUrl(item.Id, backdrop, 'Backdrop', backdropPx) }}
                style={styles.backdrop}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View style={[styles.backdrop, { backgroundColor: colors.bgElevated }]} />
            )}
            {/* Flat shade so a bright backdrop does not wash out the title. */}
            <View style={styles.heroShadeFill} />
            {/* Near-black under the status bar so the Dynamic Island cutout
                does not sit against a bright frame. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.45)', 'transparent']}
              locations={[0, 0.55, 1]}
              style={[StyleSheet.absoluteFill, { height: 130, bottom: undefined }]}
            />
            <LinearGradient
              colors={[colors.scrimTop, colors.bg]}
              locations={[0, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <View style={styles.body}>
          <View style={styles.headerRow}>
            {primary ? (
              <Image
                source={{ uri: tmdbArt.poster ?? Jellyfin.imageUrl(item.Id, primary, 'Primary', 400) }}
                style={styles.poster}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.poster, { backgroundColor: colors.surface }]} />
            )}
            <View style={styles.metaCol}>
              <Text style={styles.title}>{item.Name}</Text>
              <View style={styles.pillRow}>
                <View style={styles.pill}><Text style={styles.pillText}>{kind}</Text></View>
                {years ? (
                  <View style={styles.pill}><Text style={styles.pillText}>{years}</Text></View>
                ) : null}
                {seasonCount ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{t('detail.seasons', { count: seasonCount })}</Text>
                  </View>
                ) : null}
                {runtimeMin ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>
                      {item.Type === 'Series' ? t('detail.perEpisode', { minutes: runtimeMin }) : `${runtimeMin}m`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {item.Type !== 'Series' ? (
            <>
              <ButtonRow style={styles.actionRow}>
                {/* Apple names the button after what it will do, so a part-watched
                    item offers Resume rather than Play. */}
                <PrimaryButton
                  label={(item.UserData?.PlaybackPositionTicks ?? 0) > 0 ? t('detail.resume') : t('detail.play')}
                  icon={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                  onPress={play}
                  style={styles.playAction}
                />
                <CircleButton
                  icon={{ ios: 'tv.badge.wifi', android: 'cast', web: 'cast' }}
                  onPress={() => setCastPickerOpen(true)}
                  accessibilityLabel={t('player.castLabel')}
                  tint={castState === 'connected' ? colors.pink : undefined}
                />
              </ButtonRow>
              <Text style={styles.castHint}>
                Cast: {castState ?? 'sdk-not-ready'} · AirPlay picker is inside the player
              </Text>
            </>
          ) : null}

          {item.Overview ? (
            <OverviewCard
              text={plainText(localisedOverview ?? item.Overview)}
              clamp={item.Type === 'Series'}
            />
          ) : null}

          {item.Type === 'Series' && state.status === 'signed-in' ? (
            <SeriesEpisodes
              seriesId={item.Id}
              userId={state.auth.userId}
              tmdbId={Jellyfin.tmdbId(item)}
              seasons={seasons}
            />
          ) : null}
        </View>
      </Animated.ScrollView>
      <CastPickerModal visible={castPickerOpen} onClose={() => setCastPickerOpen(false)} />
    </View>
  );
}

/**
 * The description, clamped on a series.
 *
 * On a film this is the last thing on the screen, so its length costs nothing.
 * On a series the episode list is underneath it, and that list is what you came
 * for - and these descriptions are long: AniDB writes four paragraphs plus a
 * source note, which pushed episode one about two screens down.
 *
 * Three lines and a tap, the way Apple TV and Netflix handle the same problem:
 * enough to decide whether to watch, without standing between you and the
 * thing you meant to play.
 */
function OverviewCard({ text, clamp }: { text: string; clamp: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Only worth a control when there is more to see. Three lines is roughly 180
  // characters at this width; below that the tap would do nothing visible.
  const clamped = clamp && !expanded && text.length > 180;

  return (
    <TouchableOpacity
      style={styles.overviewCard}
      activeOpacity={clamp ? 0.8 : 1}
      onPress={clamp ? () => setExpanded(v => !v) : undefined}
      accessibilityRole={clamp ? 'button' : undefined}
      accessibilityLabel={clamp ? t(expanded ? 'detail.showLess' : 'detail.showMore') : undefined}
    >
      <Text style={styles.sectionLabel}>{t('detail.overview')}</Text>
      <Text style={styles.overview} numberOfLines={clamped ? 3 : undefined}>{text}</Text>
      {clamp && text.length > 180 ? (
        <Text style={styles.overviewMore}>{t(expanded ? 'detail.showLess' : 'detail.showMore')}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function VLCEnginePlayer({ url, itemId, mediaSourceId, externalSubs, audioStreams, delayKey, title, resumeSeconds, initialDuration, playMethod = 'DirectPlay', onExit }: {
  url: string;
  itemId: string;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  audioStreams: AudioStream[];
  delayKey: string;
  title: string;
  resumeSeconds: number;
  initialDuration: number;
  playMethod?: Jellyfin.PlayMethod;
  onExit: () => void;
}) {
  const vlcRef = useRef<any>(null);
  const lastSeekAt = useRef(0);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [ready, setReady] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [rate, setRate] = useState(1);
  const [activeSubIndex, setActiveSubIndex] = useState<number | null>(null);
  const [externalCues, setExternalCues] = useState<VttCue[]>([]);
  const [activeCue, setActiveCue] = useState<VttCue | null>(null);
  const [subFontSize, setSubFontSize] = useState(18);
  const [vlcKey, setVlcKey] = useState(0);
  const positionRef = useRef(0);
  const [vlcTextTracks, setVlcTextTracks] = useState<{ id: number; name?: string }[]>([]);
  const [vlcTextTrackId, setVlcTextTrackId] = useState<number>(-1); // -1 = off
  const [vlcAudioTracks, setVlcAudioTracks] = useState<{ id: number; name?: string }[]>([]);
  const [vlcAudioTrackId, setVlcAudioTrackId] = useState<number>(-1);
  const [audioOpen, setAudioOpen] = useState(false);
  const [subDelayMs, setSubDelayMs] = useState(0);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const prefsRef = useRef<Prefs | null>(null);
  /**
   * What we last asked VLC for. A remount gives us a fresh media player that
   * reselects the container's own defaults, so these are what gets asserted
   * again on the next load rather than whatever React state happens to hold.
   */
  const desiredTextTrack = useRef(-1);
  const desiredAudioTrack = useRef<number | null>(null);
  const audioAutoPicked = useRef(false);

  // Keep positionRef synced so background/foreground can restore.
  useEffect(() => { positionRef.current = position; }, [position]);

  // Same trick for paused: the reporting below has to read the current value
  // without listing it as a dependency.
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  /**
   * Remount VLC when coming back from the background, so the video surface
   * reattaches - iOS drops it while backgrounded, leaving audio playing over a
   * black frame.
   *
   * Only a real background warrants that. Pulling down Control Center or the
   * notification shade, or a call banner arriving, moves the app to 'inactive'
   * and straight back to 'active' without ever taking the surface away, so
   * remounting there tore down a perfectly good player: the video reloaded,
   * buffered from scratch and lost its tracks, for a glance at the toggles.
   */
  const wasBackgrounded = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wasBackgrounded.current = true;
      } else if (state === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        setVlcKey(k => k + 1);
        setReady(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Report progress to Jellyfin.
  //
  // The cleanup reads positionRef, not position. With an empty dependency list
  // the closure keeps the value from the first render - zero - so every VLC
  // playback reported "stopped at 0" on the way out, wiping the resume point
  // for exactly the files that use this engine: mkv, and most anime.
  useEffect(() => {
    Jellyfin.reportPlaybackStart(itemId, Jellyfin.secondsToTicks(resumeSeconds), playMethod).catch(() => {});
    return () => {
      try {
        Jellyfin.reportPlaybackStopped(itemId, Jellyfin.secondsToTicks(positionRef.current), playMethod).catch(() => {});
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply subtitle prefs + auto-select last-used or preferred language sub.
  useEffect(() => {
    (async () => {
      const prefs = await loadPrefs();
      prefsRef.current = prefs;
      const sizeMap = { sm: 14, md: 18, lg: 24 } as const;
      setSubFontSize(sizeMap[prefs.subtitleSize] ?? 18);
      setSubDelayMs(prefs.subtitleDelays?.[delayKey] ?? 0);
      setPrefsLoaded(true);

      if (prefs.lastSubLabel && prefs.lastSubLabel !== 'off') {
        const exact = externalSubs.find(s => s.label === prefs.lastSubLabel);
        if (exact) {
          pickExternalSub(exact.index, false);
          return;
        }
      }
      if (prefs.lastSubLabel !== 'off' && prefs.subtitleLanguage && prefs.subtitleLanguage !== 'off') {
        const match = externalSubs.find(s => matchesLanguage(s.label, prefs.subtitleLanguage));
        if (match) pickExternalSub(match.index, false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Track active cue for external subs.
   *
   * Cues are looked up at `position - delay`, so a positive delay holds each
   * line back: at 12s of video with a 2s delay we show the line written for
   * 10s. This is the only place a timing correction can happen - VLC exposes
   * no subtitle-delay control, so it works on jellylab's own overlay, which is
   * also the path Jellyfin serves embedded tracks through.
   */
  useEffect(() => {
    if (externalCues.length === 0) {
      if (activeCue) setActiveCue(null);
      return;
    }
    const cue = findActiveCue(externalCues, position - subDelayMs / 1000);
    if (cue !== activeCue) setActiveCue(cue);
  }, [position, externalCues, activeCue, subDelayMs]);

  async function changeSubDelay(nextMs: number) {
    const clamped = Math.max(-30000, Math.min(30000, nextMs));
    setSubDelayMs(clamped);
    try {
      const prefs = prefsRef.current ?? (await loadPrefs());
      prefsRef.current = withSubtitleDelay(prefs, delayKey, clamped);
      await savePrefs(prefsRef.current);
    } catch {}
  }

  /**
   * VLC reports its own audio tracks in container order, which is the order
   * Jellyfin lists them in too, so its far richer DisplayTitle is matched to
   * VLC's track id by position. VLC's own name is the fallback for the case
   * where the two lists disagree in length.
   */
  function audioTrackLabel(track: { id: number; name?: string }, i: number): string {
    const fromJellyfin = audioStreams[i]?.label?.trim();
    if (fromJellyfin) return cleanSubLabel(fromJellyfin);
    const fromVlc = (track.name ?? '').trim();
    return fromVlc || `Track ${i + 1}`;
  }

  const audioChoices = vlcAudioTracks.map((t, i) => ({
    id: t.id,
    label: audioTrackLabel(t, i),
    language: audioStreams[i]?.language,
  }));

  function applyAudioTrack(id: number, persist = true) {
    desiredAudioTrack.current = id;
    setVlcAudioTrackId(id);
    if (!persist) return;
    const picked = audioChoices.find(t => t.id === id);
    if (!picked) return;
    (async () => {
      try {
        const prefs = prefsRef.current ?? (await loadPrefs());
        prefsRef.current = { ...prefs, lastAudioLabel: picked.label };
        await savePrefs(prefsRef.current);
      } catch {}
    })();
  }

  /**
   * Pick the audio track the user actually wants, once per playback.
   *
   * Anime is the case that forces this: a release commonly ships an English
   * dub first in the file, so the container default is the wrong language and
   * VLC happily plays it. Settings has had a "Preferred audio language" option
   * all along, but nothing read it - this is what makes it do something.
   */
  useEffect(() => {
    if (audioAutoPicked.current) return;
    if (!prefsLoaded || audioChoices.length < 2) return;
    audioAutoPicked.current = true;
    const prefs = prefsRef.current;
    if (!prefs) return;
    const byLastUsed = prefs.lastAudioLabel
      ? audioChoices.find(t => t.label === prefs.lastAudioLabel)
      : undefined;
    const byLanguage =
      prefs.audioLanguage && prefs.audioLanguage !== 'original'
        ? audioChoices.find(t => matchesLanguage(t.language ?? t.label, prefs.audioLanguage))
        : undefined;
    const pick = byLastUsed ?? byLanguage;
    // persist=false: an automatic choice should not overwrite what the user
    // last chose by hand, or every title would rewrite the preference.
    if (pick) applyAudioTrack(pick.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, vlcAudioTracks]);

  async function pickExternalSub(streamIndex: number | null, persistPref = true) {
    setActiveSubIndex(streamIndex);
    // Always disable VLC's internal track when we render an external overlay
    // (or when explicitly turning off), otherwise both would be drawn.
    // VLC ignores the textTrack prop when going from auto-selected -> -1,
    // so force a remount so it starts fresh with no internal subs.
    desiredTextTrack.current = -1;
    setVlcTextTrackId(-1);
    setReady(false);
    setVlcKey(k => k + 1);
    if (streamIndex == null || !mediaSourceId) {
      setExternalCues([]);
      setActiveCue(null);
      if (persistPref) {
        try {
          const prefs = await loadPrefs();
          const { savePrefs } = await import('@/store/prefs');
          await savePrefs({ ...prefs, lastSubLabel: 'off' });
        } catch {}
      }
      return;
    }
    try {
      const auth = await import('@/store/auth').then(m => m.loadJellyfinAuth());
      if (!auth) return;
      const url = Jellyfin.subtitleUrl(itemId, mediaSourceId, streamIndex, auth.accessToken, 'vtt');
      const vtt = await Jellyfin.fetchSubtitleVtt(url);
      setExternalCues(parseVtt(vtt));
      if (persistPref) {
        const picked = externalSubs.find(s => s.index === streamIndex);
        if (picked) {
          try {
            const prefs = await loadPrefs();
            const { savePrefs } = await import('@/store/prefs');
            await savePrefs({ ...prefs, lastSubLabel: picked.label });
          } catch {}
        }
      }
    } catch {
      setExternalCues([]);
    }
  }

  function pickInternalSub(trackId: number) {
    // Enable VLC internal track, clear any external overlay
    desiredTextTrack.current = trackId;
    setVlcTextTrackId(trackId);
    setActiveSubIndex(null);
    setExternalCues([]);
    setActiveCue(null);
  }

  // Depending on position rebuilt this interval on every tick from the player -
  // several times a second - so the 15 second timer restarted before it could
  // ever fire, and nothing was reported mid-playback at all. The refs let the
  // timer live for as long as the screen does.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        Jellyfin.reportPlaybackProgress(
          itemId,
          Jellyfin.secondsToTicks(positionRef.current),
          pausedRef.current,
          playMethod,
        ).catch(() => {});
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [itemId, playMethod]);

  // Pause and resume are worth reporting immediately rather than waiting up to
  // fifteen seconds - the native engine already does this, and without it a
  // paused film keeps counting as playing on the server. Skipped on mount,
  // where reportPlaybackStart has just said the same thing.
  const reportedPause = useRef(true);
  useEffect(() => {
    if (reportedPause.current) { reportedPause.current = false; return; }
    Jellyfin.reportPlaybackProgress(
      itemId,
      Jellyfin.secondsToTicks(positionRef.current),
      paused,
      playMethod,
    ).catch(() => {});
  }, [paused, itemId, playMethod]);

  // Auto-hide controls
  useEffect(() => {
    if (!controlsVisible || paused) return;
    const t = setTimeout(() => setControlsVisible(false), 4000);
    return () => clearTimeout(t);
  }, [controlsVisible, paused, position]);

  function togglePlay() {
    setPaused(p => !p);
    setControlsVisible(true);
  }

  function vlcSeek(seconds: number) {
    if (duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, seconds / duration));
    lastSeekAt.current = Date.now();
    try {
      // react-native-vlc-media-player ref.seek takes a 0..1 percentage
      vlcRef.current?.seek?.(ratio);
    } catch {}
  }

  function skip(seconds: number) {
    const next = Math.max(0, Math.min(duration, position + seconds));
    vlcSeek(next);
    setPosition(next);
    setControlsVisible(true);
  }

  function seekTo(t: number) {
    vlcSeek(t);
    setPosition(t);
  }

  function changeSpeed(nextRate: number) {
    setRate(nextRate);
    setSpeedOpen(false);
  }

  async function toggleFullscreen() {
    setControlsVisible(true);
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
      }
    } catch {}
  }

  // Resume once loaded (initial resumeSeconds, or last position after remount)
  const onLoad = (e: any) => {
    setReady(true);
    const durSecs = (e?.duration ?? 0) / 1000;
    if (durSecs > 0) setDuration(durSecs);

    // Capture available internal text tracks from VLC.
    const rawTracks = Array.isArray(e?.textTracks) ? e.textTracks : [];
    const tracks = rawTracks.filter((t: any) => t && t.id != null && t.id !== -1);
    setVlcTextTracks(tracks);

    const rawAudio = Array.isArray(e?.audioTracks) ? e.audioTracks : [];
    const audio = rawAudio.filter((t: any) => t && t.id != null && t.id !== -1);
    setVlcAudioTracks(audio);

    // VLC only acts on textTrack/audioTrack when the prop *changes*, and a
    // fresh instance has already reselected the container's defaults by the
    // time it loads. Re-asserting the same value is therefore a no-op, so
    // every re-apply below ping-pongs through another value first.
    const reassert = (want: number, apply: (v: number) => void, via: number) => {
      setTimeout(() => {
        apply(via);
        setTimeout(() => apply(want), 80);
      }, 300);
    };

    if (vlcTextTrackId === -1 && tracks.length > 0) {
      // Subs should be off, but VLC autoplayed with a default embedded track:
      // the -1 from the initial render was silently ignored.
      reassert(-1, setVlcTextTrackId, tracks[0].id);
    } else if (desiredTextTrack.current !== -1 && tracks.some((t: any) => t.id === desiredTextTrack.current)) {
      // A remount had dropped the chosen embedded track, and the only way back
      // was to open the picker and select something else and then this one
      // again - which is exactly the ping-pong, done by hand.
      reassert(desiredTextTrack.current, setVlcTextTrackId, -1);
    }

    const wantAudio = desiredAudioTrack.current;
    if (wantAudio != null && audio.length > 1 && audio.some((t: any) => t.id === wantAudio)) {
      const other = audio.find((t: any) => t.id !== wantAudio)?.id ?? -1;
      reassert(wantAudio, setVlcAudioTrackId, other);
    }

    const seekSecs = positionRef.current > 0 ? positionRef.current : resumeSeconds;
    if (seekSecs > 0 && durSecs > 0) {
      const ratio = Math.max(0, Math.min(1, seekSecs / durSecs));
      setTimeout(() => {
        try {
          lastSeekAt.current = Date.now();
          vlcRef.current?.seek?.(ratio);
        } catch {}
      }, 200);
    }
    if (paused) {
      setTimeout(() => {
        try { vlcRef.current?.pause?.(); } catch {}
      }, 300);
    }
  };

  const onProgress = (e: any) => {
    if (scrubbing) return;
    // Ignore progress right after a seek — VLC briefly reports 0 while it catches up.
    if (Date.now() - lastSeekAt.current < 1500) return;
    const cur = (e?.currentTime ?? 0) / 1000;
    const dur = (e?.duration ?? 0) / 1000;
    if (dur > 0) setDuration(dur);
    // Ignore a stray 0 when we know we were much further in.
    if (cur < 0.5 && position > 5) return;
    setPosition(cur);
    if (seekTarget != null && Math.abs(cur - seekTarget) < 2) setSeekTarget(null);
  };

  return (
    <>
      <StatusBar hidden />
      <View style={{ flex: 1 }}>
        <VLCPlayer
          key={vlcKey}
          ref={vlcRef}
          style={{ flex: 1 }}
          source={{ uri: url }}
          autoplay
          paused={paused}
          rate={rate}
          textTrack={vlcTextTrackId}
          audioTrack={vlcAudioTrackId >= 0 ? vlcAudioTrackId : undefined}
          resizeMode="contain"
          playInBackground={false}
          onLoad={onLoad}
          onProgress={onProgress}
          onEnd={onExit}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setControlsVisible(v => !v)}
        />
        {!ready ? (
          <View style={styles.vlcLoading} pointerEvents="none">
            <ActivityIndicator color={colors.text} size="large" />
          </View>
        ) : null}
        {activeCue ? (
          <View style={[styles.subOverlay, { bottom: controlsVisible ? 130 : 40 }]} pointerEvents="none">
            <Text style={[styles.subText, { fontSize: subFontSize, lineHeight: subFontSize + 6 }]}>
              {activeCue.text}
            </Text>
          </View>
        ) : null}
        {controlsVisible ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.8)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.overlayTop} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.overlayIconBtn}
                onPress={onExit}
                activeOpacity={0.7}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={colors.text} size={22} />
              </TouchableOpacity>
              <Text style={styles.overlayTitle} numberOfLines={1}>{title}</Text>
            </View>

            <View style={styles.overlayCenter} pointerEvents="box-none">
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(-10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.playPauseBtn} onPress={togglePlay} activeOpacity={0.7}>
                <SymbolView
                  name={{ ios: paused ? 'play.fill' : 'pause.fill', android: 'play_arrow', web: 'play_arrow' }}
                  tintColor={colors.text}
                  size={44}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
            </View>

            <View style={styles.overlayBottomWrap} pointerEvents="box-none">
              <View style={styles.scrubRow} pointerEvents="box-none">
                <Text style={styles.timeText}>{formatTime(scrubbing ? scrubValue : position)}</Text>
                <Scrubber
                  position={scrubbing ? scrubValue : position}
                  duration={duration}
                  onScrubStart={() => setScrubbing(true)}
                  onScrub={(t) => setScrubValue(t)}
                  onScrubEnd={(t) => {
                    seekTo(t);
                    setScrubbing(false);
                    setControlsVisible(true);
                  }}
                />
                <Text style={styles.timeText}>
                  -{formatTime(Math.max(0, duration - (scrubbing ? scrubValue : position)))}
                </Text>
              </View>
              <View style={styles.actionsRow} pointerEvents="box-none">
                <View style={{ flex: 1 }} />
                {audioChoices.length > 1 ? (
                  <TouchableOpacity style={styles.overlayIconBtn} onPress={() => setAudioOpen(true)} activeOpacity={0.7}>
                    <SymbolView name={{ ios: 'waveform', android: 'graphic_eq', web: 'graphic_eq' }} tintColor={colors.text} size={22} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.overlayIconBtn} onPress={() => setSubsOpen(true)} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'captions.bubble', android: 'closed_caption', web: 'closed_caption' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={() => setSpeedOpen(true)} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={toggleFullscreen} activeOpacity={0.7}>
                  <SymbolView
                    name={{
                      ios: isLandscape ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right',
                      android: 'fullscreen',
                      web: 'fullscreen',
                    }}
                    tintColor={colors.text}
                    size={22}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      <AudioTracksModal
        visible={audioOpen}
        tracks={audioChoices}
        activeId={vlcAudioTrackId}
        declaredCount={audioStreams.length}
        onPick={(id) => {
          applyAudioTrack(id);
          setAudioOpen(false);
        }}
        onClose={() => setAudioOpen(false)}
      />
      <VlcSubsModal
        visible={subsOpen}
        externalSubs={externalSubs}
        internalTracks={vlcTextTracks}
        activeExternalIndex={activeSubIndex}
        activeInternalId={vlcTextTrackId}
        subDelayMs={subDelayMs}
        delayEnabled={externalCues.length > 0}
        onDelayChange={changeSubDelay}
        onPickExternal={(idx) => {
          pickExternalSub(idx);
          setSubsOpen(false);
        }}
        onPickInternal={(id) => {
          pickInternalSub(id);
          setSubsOpen(false);
        }}
        onOff={() => {
          // pickExternalSub(null) already forces remount + textTrack=-1
          pickExternalSub(null);
          setSubsOpen(false);
        }}
        onClose={() => setSubsOpen(false)}
      />
      <SpeedPickerModal
        visible={speedOpen}
        current={rate}
        onClose={() => setSpeedOpen(false)}
        onPick={changeSpeed}
      />
    </>
  );
}

function cleanSubLabel(raw: string): string {
  // Collapse redundant "English - [English]" style into "English",
  // drop empty brackets, trim separators.
  let s = raw ?? '';
  // Strip "- [X]" if X duplicates a preceding word
  s = s.replace(/\s*-\s*\[([^\]]+)\]/g, (_, inner) => {
    const before = s.split(/\s*-\s*\[/)[0].trim().toLowerCase();
    return before.includes(inner.toLowerCase()) ? '' : ` (${inner})`;
  });
  // Trim trailing " - Default" style dashes
  s = s.replace(/\s*-\s*Default\b/i, '');
  return s.trim();
}

function VlcSubsModal({
  visible, externalSubs, internalTracks, activeExternalIndex, activeInternalId,
  subDelayMs, delayEnabled, onDelayChange,
  onPickExternal, onPickInternal, onOff, onClose,
}: {
  visible: boolean;
  externalSubs: { index: number; label: string }[];
  internalTracks: { id: number; name?: string }[];
  activeExternalIndex: number | null;
  activeInternalId: number;
  subDelayMs: number;
  delayEnabled: boolean;
  onDelayChange: (ms: number) => void;
  onPickExternal: (index: number) => void;
  onPickInternal: (id: number) => void;
  onOff: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isOff = activeExternalIndex == null && activeInternalId === -1;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, styles.modalSheetTall]} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('player.subtitles')}</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {externalSubs.length === 0 && internalTracks.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('player.noSubtitles')}</Text>
            ) : (
              <>
                <TrackRow label={t('player.off')} selected={isOff} onPress={onOff} />
                {internalTracks.length > 0 ? <SubGroupLabel>{t('player.embedded')}</SubGroupLabel> : null}
                {internalTracks.map(t => (
                  <TrackRow
                    key={`int-${t.id}`}
                    label={cleanSubLabel(t.name ?? `Track ${t.id}`)}
                    selected={activeInternalId === t.id}
                    onPress={() => onPickInternal(t.id)}
                  />
                ))}
                {externalSubs.length > 0 ? <SubGroupLabel>{t('player.external')}</SubGroupLabel> : null}
                {externalSubs.map(s => (
                  <TrackRow
                    key={`ext-${s.index}`}
                    label={cleanSubLabel(s.label)}
                    selected={activeExternalIndex === s.index}
                    onPress={() => onPickExternal(s.index)}
                  />
                ))}
              </>
            )}
          </ScrollView>

          <View style={styles.delayBlock}>
            <View style={styles.delayHeader}>
              <Text style={styles.delayLabel}>{t('player.timing')}</Text>
              <Text style={styles.delayValue}>
                {subDelayMs === 0 ? 'In sync' : `${subDelayMs > 0 ? '+' : ''}${(subDelayMs / 1000).toFixed(1)}s`}
              </Text>
            </View>
            <View style={styles.delayRow}>
              <DelayButton label="-0.5s" disabled={!delayEnabled} onPress={() => onDelayChange(subDelayMs - 500)} />
              <DelayButton label="-0.1s" disabled={!delayEnabled} onPress={() => onDelayChange(subDelayMs - 100)} />
              <DelayButton label={t('player.reset')} disabled={!delayEnabled || subDelayMs === 0} onPress={() => onDelayChange(0)} />
              <DelayButton label="+0.1s" disabled={!delayEnabled} onPress={() => onDelayChange(subDelayMs + 100)} />
              <DelayButton label="+0.5s" disabled={!delayEnabled} onPress={() => onDelayChange(subDelayMs + 500)} />
            </View>
            <Text style={styles.delayHint}>
              {delayEnabled
                ? 'Plus shows subtitles later, minus shows them earlier.'
                : 'Pick a track under External to adjust its timing. Embedded tracks are drawn by VLC, which offers no timing control.'}
            </Text>
          </View>

          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>{t('player.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DelayButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.delayBtn, disabled && styles.delayBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.delayBtnText, disabled && styles.delayBtnTextDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Audio track picker.
 *
 * `declaredCount` is how many tracks Jellyfin said the file has. When that is
 * more than VLC can see, the stream is being transcoded and the server has
 * already collapsed it to one - worth saying plainly, because the alternative
 * is a picker that inexplicably lists a single entry.
 */
function AudioTracksModal({
  visible, tracks, activeId, declaredCount, onPick, onClose,
}: {
  visible: boolean;
  tracks: { id: number; label: string }[];
  activeId: number;
  declaredCount: number;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, styles.modalSheetTall]} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('player.audio')}</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {tracks.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('player.noAudio')}</Text>
            ) : (
              tracks.map(t => (
                <TrackRow
                  key={`aud-${t.id}`}
                  label={t.label}
                  selected={activeId === t.id}
                  onPress={() => onPick(t.id)}
                />
              ))
            )}
          </ScrollView>
          {declaredCount > tracks.length && tracks.length > 0 ? (
            <Text style={styles.delayHint}>
              This file has {declaredCount} audio tracks, but it is being transcoded and the
              server sends only one. Set playback quality to Original to switch between them.
            </Text>
          ) : null}
          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>{t('player.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SubGroupLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subGroupLabel}>{children}</Text>;
}

function ExternalSubsModal({
  visible, externalSubs, activeIndex, onPick, onClose,
}: {
  visible: boolean;
  externalSubs: { index: number; label: string }[];
  activeIndex: number | null;
  onPick: (index: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('player.subtitles')}</Text>
          {externalSubs.length === 0 ? (
            <Text style={styles.modalEmpty}>{t('player.noExternalSubtitles')}</Text>
          ) : (
            <>
              <TrackRow label={t('player.off')} selected={activeIndex == null} onPress={() => onPick(null)} />
              {externalSubs.map(s => (
                <TrackRow
                  key={`ext-vlc-${s.index}`}
                  label={s.label}
                  selected={activeIndex === s.index}
                  onPress={() => onPick(s.index)}
                />
              ))}
            </>
          )}
          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>{t('player.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CastPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const castState = useCastState();
  const [devices, setDevices] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setScanning(true);

    const discovery = GoogleCast.getDiscoveryManager();
    let sub: any;

    (async () => {
      try {
        await discovery.startDiscovery();
        const current = await discovery.getDevices();
        setDevices(current ?? []);
      } catch {}
    })();

    try {
      sub = discovery.onDevicesUpdated((next) => {
        setDevices(next ?? []);
      });
    } catch {}

    const t = setTimeout(() => setScanning(false), 6000);

    return () => {
      clearTimeout(t);
      try { sub?.remove?.(); } catch {}
    };
  }, [visible]);

  async function connect(device: any) {
    setConnecting(device.deviceId);
    try {
      await GoogleCast.getSessionManager().startSession(device.deviceId);
      onClose();
    } catch (e: any) {
      // swallow
    } finally {
      setConnecting(null);
    }
  }

  async function disconnect() {
    try {
      await GoogleCast.getSessionManager().endCurrentSession(true);
    } catch {}
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('player.castTo')}</Text>
            {scanning ? <ActivityIndicator color={colors.text} /> : null}
          </View>
          <Text style={styles.modalSub}>State: {castState ?? 'unknown'}</Text>

          {castState === 'connected' ? (
            <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect} activeOpacity={0.8}>
              <Text style={styles.disconnectText}>{t('player.disconnect')}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ marginTop: spacing.md }}>
            {devices.length === 0 && !scanning ? (
              <Text style={styles.modalEmpty}>{t('player.noDevices')}</Text>
            ) : null}
            {devices.map((d) => (
              <TouchableOpacity
                key={d.deviceId ?? d.uniqueId}
                style={styles.deviceRow}
                onPress={() => connect(d)}
                disabled={!!connecting}
                activeOpacity={0.7}
              >
                <SymbolView
                  name={{ ios: 'tv.badge.wifi', android: 'cast', web: 'cast' }}
                  tintColor={colors.text}
                  size={22}
                />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.deviceName}>{d.friendlyName ?? d.name ?? 'Unknown device'}</Text>
                  {d.modelName ? <Text style={styles.deviceModel}>{d.modelName}</Text> : null}
                </View>
                {connecting === d.deviceId ? <ActivityIndicator color={colors.text} /> : null}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>{t('player.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SeriesEpisodes({ seriesId, userId, tmdbId, seasons }: {
  seriesId: string;
  userId: string;
  /** null when the series was never matched against TMDB. */
  tmdbId: number | null;
  /** Fetched by the screen above, which needs the count for its pill. */
  seasons: any[];
}) {
  const router = useRouter();
  const { i18n } = useTranslation();
  /**
   * Titles and descriptions in the app's language, by episode number.
   *
   * The anime library is scraped in Japanese, so the server returns 両面宿儺 and
   * a Japanese synopsis for every episode. TMDB will answer in whichever
   * language is asked for, and Jellyseerr passes the parameter through - so
   * this fills in over the top, and leaves the server's text wherever TMDB has
   * no translation.
   */
  const [localised, setLocalised] = useState<Map<number, Jellyseerr.LocalisedEpisode>>(new Map());
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEps, setLoadingEps] = useState(false);

  useEffect(() => {
    if (seasons.length === 0) return;
    setLoading(false);
    setActiveSeasonId(current => current ?? seasons[0]?.Id ?? null);
  }, [seasons]);

  useEffect(() => {
    if (!activeSeasonId) return;
    setLoadingEps(true);
    Jellyfin.getEpisodes(userId, seriesId, activeSeasonId)
      .then(setEpisodes)
      .finally(() => setLoadingEps(false));
  }, [activeSeasonId, seriesId, userId]);

  const activeSeasonNumber = seasons.find(s => s.Id === activeSeasonId)?.IndexNumber;

  useEffect(() => {
    if (!tmdbId || typeof activeSeasonNumber !== 'number') return;
    let cancelled = false;
    Jellyseerr.getSeasonEpisodes(tmdbId, activeSeasonNumber, metadataLanguage(i18n.language))
      .then(map => { if (!cancelled) setLocalised(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tmdbId, activeSeasonNumber, i18n.language]);

  if (loading) {
    return (
      <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.xl }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
      >
        {seasons.map(s => {
          const active = s.Id === activeSeasonId;
          return (
            <TouchableOpacity
              key={s.Id}
              style={[styles.seasonPill, active && styles.seasonPillActive]}
              onPress={() => setActiveSeasonId(s.Id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.seasonPillText, active && styles.seasonPillTextActive]}>
                {s.Name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ marginTop: spacing.md }}>
        {loadingEps ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: spacing.lg }} />
        ) : (
          episodes.map(ep => {
            const primary = ep.ImageTags?.Primary;
            const runtimeMin = ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 600_000_000) : null;
            const played = ep.UserData?.Played;
            const progress =
              ep.UserData?.PlaybackPositionTicks && ep.RunTimeTicks
                ? Math.min(1, ep.UserData.PlaybackPositionTicks / ep.RunTimeTicks)
                : 0;
            return (
              <TouchableOpacity
                key={ep.Id}
                style={styles.epRow}
                onPress={() => router.push(`/item/${ep.Id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.epThumbWrap}>
                  {primary ? (
                    <Image
                      source={{ uri: Jellyfin.imageUrl(ep.Id, primary, 'Primary', 400) }}
                      style={styles.epThumb}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.epThumb, { backgroundColor: colors.surface }]} />
                  )}
                  {progress > 0 && !played ? (
                    <View style={styles.epProgressTrack}>
                      <View style={[styles.epProgressFill, { width: `${progress * 100}%` }]} />
                    </View>
                  ) : null}
                  {played ? (
                    <View style={styles.epWatchedBadge}>
                      <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.text} size={12} />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.epTitle} numberOfLines={2}>
                    {ep.IndexNumber != null ? `${ep.IndexNumber}. ` : ''}
                    {localised.get(ep.IndexNumber ?? -1)?.name ?? ep.Name}
                  </Text>
                  <Text style={styles.epMeta}>
                    {runtimeMin ? `${runtimeMin}m` : ''}
                    {ep.PremiereDate ? ` · ${formatDate(ep.PremiereDate)}` : ''}
                  </Text>
                  {/* TMDB's copy in the app's language when it has one, the
                      server's otherwise - the anime library is scraped in
                      Japanese, so most of these come from TMDB. */}
                  {(() => {
                    const text = localised.get(ep.IndexNumber ?? -1)?.overview ?? ep.Overview;
                    return text ? (
                      <Text style={styles.epOverview} numberOfLines={2}>{oneLine(text)}</Text>
                    ) : null;
                  })()}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

function Player({
  config,
  itemId,
  delayKey,
  title,
  subtitle,
  artworkUri,
  resumeSeconds,
  initialDuration,
  onExit,
  onNativeError,
}: {
  config: PlaybackConfig;
  itemId: string;
  /** what a subtitle offset is remembered against: the series, or the film */
  delayKey: string;
  title: string;
  /** Second line on the lock screen: series and episode, or the year. */
  subtitle?: string;
  /** Poster for the lock screen and Control Centre. */
  artworkUri?: string;
  resumeSeconds: number;
  initialDuration: number;
  onExit: () => void;
  onNativeError: () => void;
}) {
  // Unlock rotation while the player is mounted; restore portrait on exit.
  useEffect(() => {
    (async () => {
      try {
        await ScreenOrientation.unlockAsync();
      } catch {}
    })();
    return () => {
      (async () => {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } catch {}
      })();
    };
  }, []);

  return (
    <View style={styles.playerContainer}>
      {config.engine === 'native' ? (
        <NativePlayer
          url={config.url}
          itemId={itemId}
          mediaSourceId={config.mediaSourceId}
          externalSubs={config.externalSubs}
          title={title}
          subtitle={subtitle}
          artworkUri={artworkUri}
          resumeSeconds={resumeSeconds}
          playMethod={config.mode === 'transcode' ? 'Transcode' : 'DirectPlay'}
          onError={onNativeError}
          onExit={onExit}
        />
      ) : (
        <VLCEnginePlayer
          url={config.url}
          itemId={itemId}
          mediaSourceId={config.mediaSourceId}
          externalSubs={config.externalSubs}
          audioStreams={config.audioStreams}
          delayKey={delayKey}
          title={title}
          resumeSeconds={resumeSeconds}
          initialDuration={initialDuration}
          playMethod={config.mode === 'transcode' ? 'Transcode' : 'DirectPlay'}
          onExit={onExit}
        />
      )}
    </View>
  );
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function NativePlayer({ url, itemId, mediaSourceId, externalSubs, title, subtitle, artworkUri, resumeSeconds, playMethod = 'DirectPlay', onError, onExit }: {
  url: string;
  itemId: string;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  title: string;
  subtitle?: string;
  artworkUri?: string;
  resumeSeconds: number;
  playMethod?: Jellyfin.PlayMethod;
  onError: () => void;
  onExit: () => void;
}) {
  // metadata belongs to the source rather than the player: it describes this
  // video, not the thing playing it.
  const source = { uri: url, metadata: { title, artist: subtitle, artwork: artworkUri } };
  const player = useVideoPlayer(source, p => {
    if (resumeSeconds > 0) {
      try { p.currentTime = resumeSeconds; } catch {}
    }
    /**
     * Hand the system what it needs to run the lock screen.
     *
     * Locking the phone mid-episode used to stop everything and show nothing:
     * no artwork, no controls, no AirPods play/pause, and the audio cut with
     * the screen. iOS will do all of that itself, given a title, an artwork URL
     * and permission to keep running - which is the UIBackgroundModes audio
     * entry added to app.json alongside this.
     *
     * The VLC engine has no equivalent, so mkv playback keeps behaving as
     * before. That is most of the anime library, and worth knowing.
     */
    p.showNowPlayingNotification = true;
    p.staysActiveInBackground = true;
    p.play();
  });
  const [tracksOpen, setTracksOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeSubIndex, setActiveSubIndex] = useState<number | null>(null);
  const [externalCues, setExternalCues] = useState<VttCue[]>([]);
  const [activeCue, setActiveCue] = useState<VttCue | null>(null);
  const [subFontSize, setSubFontSize] = useState(18);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => sub.remove();
  }, [player, onError]);

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
      // Fire an immediate progress ping when pause/resume toggles
      try {
        Jellyfin.reportPlaybackProgress(itemId, Jellyfin.secondsToTicks(player.currentTime ?? 0), !isPlaying, playMethod).catch(() => {});
      } catch {}
    });
    return () => sub.remove();
  }, [player, itemId]);

  // Apply pref-based subtitle size + auto-select preferred language sub on mount.
  useEffect(() => {
    (async () => {
      const prefs = await loadPrefs();
      const sizeMap = { sm: 14, md: 18, lg: 24 } as const;
      setSubFontSize(sizeMap[prefs.subtitleSize] ?? 18);

      // 1. Prefer exact match on the last-picked label (persisted across sessions).
      if (prefs.lastSubLabel && prefs.lastSubLabel !== 'off') {
        const exact = externalSubs.find(s => s.label === prefs.lastSubLabel);
        if (exact) {
          pickExternalSub(exact.index, /* persistPref */ false);
          return;
        }
      }

      // 2. Fall back to the language preference (alias-matched).
      if (prefs.lastSubLabel !== 'off' && prefs.subtitleLanguage && prefs.subtitleLanguage !== 'off') {
        const wanted = prefs.subtitleLanguage.toLowerCase();
        const aliases: Record<string, string[]> = {
          eng: ['eng', 'english', 'en'],
          nld: ['nld', 'nl', 'dutch', 'nederlands'],
          tur: ['tur', 'tr', 'turkish', 'türk'],
          ger: ['ger', 'deu', 'de', 'german', 'deutsch'],
          fre: ['fre', 'fra', 'fr', 'french', 'français'],
          spa: ['spa', 'es', 'spanish', 'español'],
          jpn: ['jpn', 'ja', 'japanese'],
        };
        const needles = aliases[wanted] ?? [wanted];
        const match = externalSubs.find(s => {
          const label = s.label.toLowerCase();
          return needles.some(n => label.includes(n));
        });
        if (match) {
          pickExternalSub(match.index, /* persistPref */ false);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report start on mount, stop on unmount.
  useEffect(() => {
    Jellyfin.reportPlaybackStart(itemId, Jellyfin.secondsToTicks(resumeSeconds), playMethod).catch(() => {});
    return () => {
      try {
        const pos = Jellyfin.secondsToTicks(player.currentTime ?? 0);
        Jellyfin.reportPlaybackStopped(itemId, pos, playMethod).catch(() => {});
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic progress ping every 15s.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        Jellyfin.reportPlaybackProgress(
          itemId,
          Jellyfin.secondsToTicks(player.currentTime ?? 0),
          !playing,
          playMethod,
        ).catch(() => {});
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [player, itemId, playing]);

  useEffect(() => {
    const id = setInterval(() => {
      if (scrubbing) return;
      try {
        const t = player.currentTime ?? 0;
        setPosition(t);
        setDuration(player.duration ?? 0);
        if (externalCues.length > 0) {
          const cue = findActiveCue(externalCues, t);
          setActiveCue(cue);
        } else if (activeCue) {
          setActiveCue(null);
        }
      } catch {}
    }, 250);
    return () => clearInterval(id);
  }, [player, scrubbing, externalCues, activeCue]);

  // Auto-hide controls after 4s when playing
  useEffect(() => {
    if (!controlsVisible || !playing) return;
    const t = setTimeout(() => setControlsVisible(false), 4000);
    return () => clearTimeout(t);
  }, [controlsVisible, playing, position]);

  function togglePlay() {
    if (playing) player.pause();
    else player.play();
    setControlsVisible(true);
  }

  function skip(seconds: number) {
    try {
      const next = Math.max(0, Math.min(duration, (player.currentTime ?? 0) + seconds));
      player.currentTime = next;
      setPosition(next);
      setControlsVisible(true);
    } catch {}
  }

  function seekTo(t: number) {
    try {
      player.currentTime = t;
      setPosition(t);
    } catch {}
  }

  async function toggleFullscreen() {
    setControlsVisible(true);
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
      }
    } catch {}
  }

  function togglePip() {
    try {
      (player as any).startPictureInPicture?.();
    } catch {}
  }

  function changeSpeed(rate: number) {
    try {
      player.playbackRate = rate;
      setSpeed(rate);
    } catch {}
    setSpeedOpen(false);
  }

  async function pickExternalSub(streamIndex: number | null, persistPref = true) {
    setActiveSubIndex(streamIndex);
    if (streamIndex == null || !mediaSourceId) {
      setExternalCues([]);
      setActiveCue(null);
      if (persistPref) {
        try {
          const prefs = await loadPrefs();
          const { savePrefs } = await import('@/store/prefs');
          await savePrefs({ ...prefs, lastSubLabel: 'off' });
        } catch {}
      }
      return;
    }
    try {
      const auth = await import('@/store/auth').then(m => m.loadJellyfinAuth());
      if (!auth) return;
      const url = Jellyfin.subtitleUrl(itemId, mediaSourceId, streamIndex, auth.accessToken, 'vtt');
      const vtt = await Jellyfin.fetchSubtitleVtt(url);
      const cues = parseVtt(vtt);
      setExternalCues(cues);

      if (persistPref) {
        const picked = externalSubs.find(s => s.index === streamIndex);
        if (picked) {
          try {
            const prefs = await loadPrefs();
            const { savePrefs } = await import('@/store/prefs');
            await savePrefs({ ...prefs, lastSubLabel: picked.label });
          } catch {}
        }
      }
    } catch (e) {
      setExternalCues([]);
    }
  }

  return (
    <>
      <StatusBar hidden />
      <View style={{ flex: 1 }}>
        <VideoView
          player={player}
          style={{ flex: 1 }}
          fullscreenOptions={{ enable: true, autoExitOnRotate: false }}
          allowsPictureInPicture
          nativeControls={false}
          contentFit="contain"
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setControlsVisible(v => !v)}
        />
        {controlsVisible ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.8)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Top bar */}
            <View style={styles.overlayTop} pointerEvents="box-none">
              <TouchableOpacity style={styles.overlayIconBtn} onPress={onExit} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={colors.text} size={22} />
              </TouchableOpacity>
              <Text style={styles.overlayTitle} numberOfLines={1}>{title}</Text>
            </View>

            {/* Center controls */}
            <View style={styles.overlayCenter} pointerEvents="box-none">
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(-10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.playPauseBtn} onPress={togglePlay} activeOpacity={0.7}>
                <SymbolView
                  name={{ ios: playing ? 'pause.fill' : 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                  tintColor={colors.text}
                  size={44}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
            </View>

            {/* Bottom: scrubber + action cluster */}
            <View style={styles.overlayBottomWrap} pointerEvents="box-none">
              <View style={styles.scrubRow} pointerEvents="box-none">
                <Text style={styles.timeText}>{formatTime(scrubbing ? scrubValue : position)}</Text>
                <Scrubber
                  position={scrubbing ? scrubValue : position}
                  duration={duration}
                  onScrubStart={() => setScrubbing(true)}
                  onScrub={(t) => setScrubValue(t)}
                  onScrubEnd={(t) => {
                    seekTo(t);
                    setScrubbing(false);
                    setControlsVisible(true);
                  }}
                />
                <Text style={styles.timeText}>
                  -{formatTime(Math.max(0, duration - (scrubbing ? scrubValue : position)))}
                </Text>
              </View>

              <View style={styles.actionsRow} pointerEvents="box-none">
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.overlayIconBtn} onPress={() => setTracksOpen(true)} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'captions.bubble', android: 'closed_caption', web: 'closed_caption' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={() => setSpeedOpen(true)} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={togglePip} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'pip.enter', android: 'picture_in_picture_alt', web: 'picture_in_picture_alt' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={toggleFullscreen} activeOpacity={0.7}>
                  <SymbolView
                    name={{
                      ios: isLandscape ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right',
                      android: 'fullscreen',
                      web: 'fullscreen',
                    }}
                    tintColor={colors.text}
                    size={22}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
        {activeCue ? (
          <View
            style={[styles.subOverlay, { bottom: controlsVisible ? 130 : 40 }]}
            pointerEvents="none"
          >
            <Text style={[styles.subText, { fontSize: subFontSize, lineHeight: subFontSize + 6 }]}>
              {activeCue.text}
            </Text>
          </View>
        ) : null}
      </View>
      <TrackPickerModal
        visible={tracksOpen}
        player={player}
        externalSubs={externalSubs}
        activeExternalSubIndex={activeSubIndex}
        onPickExternal={pickExternalSub}
        onClose={() => setTracksOpen(false)}
      />
      <SpeedPickerModal
        visible={speedOpen}
        current={speed}
        onClose={() => setSpeedOpen(false)}
        onPick={changeSpeed}
      />
    </>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(h > 0 ? 2 : 1, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function TrackPickerModal({
  visible,
  player,
  externalSubs,
  activeExternalSubIndex,
  onPickExternal,
  onClose,
}: {
  visible: boolean;
  player: ReturnType<typeof useVideoPlayer>;
  externalSubs: { index: number; label: string }[];
  activeExternalSubIndex: number | null;
  onPickExternal: (index: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [subtitles, setSubtitles] = useState<any[]>([]);
  const [audios, setAudios] = useState<any[]>([]);
  const [activeSub, setActiveSub] = useState<any>(null);
  const [activeAudio, setActiveAudio] = useState<any>(null);

  useEffect(() => {
    if (!visible) return;
    try {
      const subs = (player as any).availableSubtitleTracks ?? [];
      const auds = (player as any).availableAudioTracks ?? [];
      setSubtitles(subs);
      setAudios(auds);
      setActiveSub((player as any).subtitleTrack ?? null);
      setActiveAudio((player as any).audioTrack ?? null);
    } catch {}
  }, [visible, player]);

  function pickEmbedded(track: any | null) {
    try {
      (player as any).subtitleTrack = track;
      setActiveSub(track);
      if (track) onPickExternal(null); // stop external overlay
    } catch {}
  }

  function pickAudio(track: any) {
    try {
      (player as any).audioTrack = track;
      setActiveAudio(track);
    } catch {}
  }

  const hasAnySub = subtitles.length > 0 || externalSubs.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>{t('player.subtitles')}</Text>
          {!hasAnySub ? (
            <Text style={styles.modalEmpty}>{t('player.noSubtitles')}</Text>
          ) : (
            <>
              <TrackRow
                label={t('player.off')}
                selected={!activeSub && activeExternalSubIndex == null}
                onPress={() => {
                  pickEmbedded(null);
                  onPickExternal(null);
                }}
              />
              {subtitles.map((t, i) => (
                <TrackRow
                  key={`emb-${i}`}
                  label={`${t.label ?? t.language ?? `Track ${i + 1}`} (embedded)`}
                  selected={activeSub && (activeSub.id === t.id || activeSub.label === t.label)}
                  onPress={() => pickEmbedded(t)}
                />
              ))}
              {externalSubs.map((s) => (
                <TrackRow
                  key={`ext-${s.index}`}
                  label={`${s.label} (external)`}
                  selected={activeExternalSubIndex === s.index}
                  onPress={() => {
                    pickEmbedded(null);
                    onPickExternal(s.index);
                  }}
                />
              ))}
            </>
          )}

          <Text style={[styles.modalTitle, { marginTop: spacing.lg }]}>{t('player.audio')}</Text>
          {audios.length === 0 ? (
            <Text style={styles.modalEmpty}>{t('player.noAlternateAudio')}</Text>
          ) : (
            audios.map((t, i) => (
              <TrackRow
                key={`aud-${i}`}
                label={t.label ?? t.language ?? `Track ${i + 1}`}
                selected={activeAudio && (activeAudio.id === t.id || activeAudio.label === t.label)}
                onPress={() => pickAudio(t)}
              />
            ))
          )}

          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>{t('player.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Scrubber({
  position, duration, onScrubStart, onScrub, onScrubEnd,
}: {
  position: number;
  duration: number;
  onScrubStart: () => void;
  onScrub: (t: number) => void;
  onScrubEnd: (t: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const durationRef = useRef(duration);
  const widthRef = useRef(width);
  const startXRef = useRef(0);
  durationRef.current = duration;
  widthRef.current = width;

  function xToTime(x: number): number {
    const w = widthRef.current || 1;
    const ratio = Math.max(0, Math.min(1, x / w));
    return ratio * durationRef.current;
  }

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const x = (e.nativeEvent as any).locationX ?? 0;
      startXRef.current = x;
      onScrubStart();
      onScrub(xToTime(x));
    },
    onPanResponderMove: (_e, gs) => {
      const x = startXRef.current + gs.dx;
      onScrub(xToTime(x));
    },
    onPanResponderRelease: (_e, gs) => {
      const x = startXRef.current + gs.dx;
      onScrubEnd(xToTime(x));
    },
    onPanResponderTerminate: (_e, gs) => {
      const x = startXRef.current + gs.dx;
      onScrubEnd(xToTime(x));
    },
  }), []);

  const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) * 100 : 0;

  return (
    <View
      style={styles.scrubberHit}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      <View style={styles.scrubberTrack}>
        <View style={[styles.scrubberFill, { width: `${pct}%` }]} />
        <View style={[styles.scrubberThumb, { left: `${pct}%` }]} />
      </View>
    </View>
  );
}

function SpeedPickerModal({
  visible, current, onClose, onPick,
}: {
  visible: boolean; current: number; onClose: () => void; onPick: (r: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t('player.speed')}</Text>
          {SPEEDS.map(rate => (
            <TrackRow
              key={rate}
              label={`${rate}x${rate === 1 ? ' (Normal)' : ''}`}
              selected={Math.abs(current - rate) < 0.01}
              onPress={() => onPick(rate)}
            />
          ))}
          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>{t('player.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TrackRow({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.deviceRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={{ ...type.body, color: colors.text, flex: 1 }}>{label}</Text>
      {selected ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.text} size={18} /> : null}
    </TouchableOpacity>
  );
}

const HERO_HEIGHT = 320;
const POSTER_OFFSET = -80;
/** Backdrop is clipped by the hero, so the hero is extended this far upward
 *  to cover what a downward rubber-band exposes. */
const HERO_BLEED = 320;
/** Headroom on the stretch so rounding can't show a hairline at the edge. */
const HERO_STRETCH_SLOP = 1.08;
/** TMDB's untouched file, and a poster size that suits a 140pt card. */
const TMDB_ORIGINAL = 'https://image.tmdb.org/t/p/original';
const TMDB_POSTER = 'https://image.tmdb.org/t/p/w780';

/** Upper bound on requested backdrop width. */
const HERO_MAX_PX = 2560;
/** Flat darkening over the backdrop, same dial as the library hero. */
const HERO_SHADE = 0.3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  hero: { width: '100%', height: HERO_HEIGHT + HERO_BLEED, marginTop: -HERO_BLEED, overflow: 'hidden' },
  // sits below the bleed at rest; the stretch transform grows it into that space
  heroBackdrop: { position: 'absolute', top: HERO_BLEED, left: 0, right: 0, bottom: 0 },
  backdrop: { width: '100%', height: '100%' },
  heroShadeFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${HERO_SHADE})` },
  body: { paddingHorizontal: spacing.xl, marginTop: POSTER_OFFSET },
  headerRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-end' },
  poster: {
    width: 120,
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  metaCol: { flex: 1, paddingBottom: spacing.sm },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.md },
  overviewMore: { ...type.small, color: colors.textMuted, marginTop: spacing.sm, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pillText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    alignItems: 'stretch',
  },
  // the button fills the row; the cast circle beside it keeps its own width
  playAction: { flex: 1 },
  castChip: {
    height: 52,
    width: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  castIcon: { width: 28, height: 28, tintColor: colors.text },
  castButton: { width: 32, height: 32, tintColor: colors.text },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassBorder,
  },
  modalSheetTall: { maxHeight: '85%' },
  delayBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  delayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  delayLabel: { ...type.bodyStrong, color: colors.text },
  delayValue: { ...type.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  delayRow: { flexDirection: 'row', gap: spacing.sm },
  delayBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  delayBtnDisabled: { opacity: 0.35 },
  delayBtnText: { ...type.small, color: colors.text, fontWeight: '600' },
  delayBtnTextDisabled: { color: colors.textMuted },
  delayHint: { ...type.small, color: colors.textDim, lineHeight: 18 },
  subGroupLabel: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  modalHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...type.h1, color: colors.text },
  modalSub: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, textTransform: 'uppercase' },
  modalEmpty: { ...type.small, color: colors.textDim, paddingVertical: spacing.md, textAlign: 'center' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deviceName: { ...type.body, color: colors.text },
  deviceModel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  disconnectBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 69, 58, 0.5)',
  },
  disconnectText: { color: 'rgba(255, 99, 99, 1)', ...type.small, fontWeight: '600' },
  modalClose: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  modalCloseText: { color: colors.accentContrast, ...type.body, fontWeight: '600' },
  castHint: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  overviewCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  overview: { ...type.body, color: colors.text, lineHeight: 22 },
  playerContainer: { flex: 1, backgroundColor: '#000' },
  exitBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.glassTint,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  exitBtnText: { color: colors.text, ...type.small, fontWeight: '600' },
  engineBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.glassTint,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  engineBadgeText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },
  subsBtn: {
    position: 'absolute',
    bottom: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },

  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  overlayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  overlayIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  overlayTitle: { ...type.bodyStrong, color: colors.text, flex: 1 },
  speedLabel: { color: colors.text, ...type.small, fontWeight: '700' },
  overlayCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  playPauseBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  skipBtn: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  overlayBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  overlayBottomWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeText: { ...type.small, color: colors.text, fontVariant: ['tabular-nums'] as any },
  scrubberHit: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
  },
  scrubberFill: { height: '100%', backgroundColor: colors.text, borderRadius: 2 },
  scrubberThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    marginLeft: -7,
  },
  vlcLoading: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  seasonPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  seasonPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  seasonPillText: { color: colors.text, ...type.small, fontWeight: '600' },
  seasonPillTextActive: { color: colors.accentContrast },

  epRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  epThumbWrap: { width: 120, height: 68, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  epThumb: { width: '100%', height: '100%' },
  epProgressTrack: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  epProgressFill: { height: '100%', backgroundColor: colors.text },
  epWatchedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 199, 89, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  epTitle: { ...type.bodyStrong, color: colors.text },
  epMeta: { ...type.caption, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase' },
  epOverview: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },
  subOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 110,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  subText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
