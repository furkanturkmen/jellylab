import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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
import { decideEngine, decidePlayback, FORCED_TRANSCODE_BITRATE, type Engine, type PlayMode } from '@/player/decide';
import { parseVtt, findActiveCue, type VttCue } from '@/player/vtt';
import { audioLanguageKey, matchesLanguage, preferredAudioIndex } from '@/player/lang';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/store/auth';
import { cleanSubLabel } from '@/components/TrackRow';
import { openPlayerSheet } from '@/store/playerSheet';
import { loadPrefs, savePrefs, withSubtitleDelay, type Prefs } from '@/store/prefs';
import { useDownload, useDownloads } from '@/hooks/useDownloads';
import { formatBytes } from '@/lib/bytes';
import {
  cancelDownload,
  enqueueDownload,
  getDownloadSync,
  localSubtitleSync,
  offlineItemSync,
  localSubtitlesSync,
  localUriSync,
  removeDownload,
  saveLocalPosition,
} from '@/store/downloads';
import { drainProgressOutbox, queueProgress } from '@/store/outbox';
import { logRequestFailure } from '@/lib/errorLog';
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
  /** Which track the server is encoding, when it is encoding one. */
  audioStreamIndex?: number | null;
  /**
   * The language the player should select on its own, already resolved -
   * "original" turned into the language TMDB says the thing was made in.
   */
  preferredAudioLanguage?: string;
  /**
   * Where to start, when this config replaced another mid-playback.
   *
   * Switching audio on a transcode is a new stream, and a new stream starts at
   * zero unless told otherwise - which would throw away the position every
   * time someone changed track.
   */
  startAt?: number;
};

/** An audio track as Jellyfin describes it, before VLC has opened the file. */
type AudioStream = { index: number; label: string; language?: string };

export default function ItemScreen() {
  // `play` is set by the long-press menu on a poster, which starts playback
  // without making you find the button on the screen it is opening.
  const { id, play: autoplay } = useLocalSearchParams<{ id: string; play?: string }>();
  const router = useRouter();
  const { state } = useAuth();
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);

  const castClient = useRemoteMediaClient();
  const castState = useCastState();
  const { t, i18n } = useTranslation();
  const [tmdbArt, setTmdbArt] = useState<{ backdrop?: string; poster?: string }>({});
  /** TMDB's description in the app's language, when it has one. */
  const [localisedOverview, setLocalisedOverview] = useState<string | null>(null);
  /**
   * The language the thing was made in, as TMDB reports it.
   *
   * What "original audio" has to mean: Japanese for anime, French for a French
   * film, English for an American one - without asking anyone to set a global
   * preference that is wrong half the time.
   */
  const [originalLanguage, setOriginalLanguage] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const download = useDownload(id);
  const downloading = download?.status === 'downloading' || download?.status === 'queued';
  /**
   * How far along, or null while the size is unknown.
   *
   * A queued item has not started and a server that sent no Content-Length
   * gives -1; both draw an empty button rather than a bar pretending to know.
   */
  const downloadProgress = download && download.totalBytes > 0
    ? download.bytesWritten / download.totalBytes
    : null;

  useEffect(() => {
    (async () => {
      try {
        await GoogleCast.getDiscoveryManager().startDiscovery();
      } catch {}
    })();
  }, []);

  /**
   * A stored item is drawn before the server is asked, not after it fails.
   *
   * The fallback below only runs when getItem rejects, and that takes the
   * fifteen second timeout - which on a plane is fifteen seconds of spinner
   * for a file sitting on the phone. What the download wrote down is enough to
   * draw the screen immediately; the server's version replaces it if it comes.
   */
  useEffect(() => {
    if (item || !id || download?.status !== 'done') return;
    const stored = offlineItemSync(id);
    if (stored) setItem(stored);
  }, [download, item, id]);

  useEffect(() => {
    if (state.status !== 'signed-in' || !id) return;
    Jellyfin.getItem(state.auth.userId, id)
      .then(fetched => {
        setItem(fetched);
        // The server answered, so anything watched offline can be handed over.
        drainProgressOutbox();
      })
      .catch(e => {
        /**
         * No server, but possibly a file.
         *
         * The screen is the only way into the player, so failing here used to
         * mean a download on the device was unreachable - which is the one
         * situation downloads exist for. What the store wrote down is enough
         * to draw a title and press play.
         */
        const offline = offlineItemSync(id);
        if (offline) {
          console.log(`[jellylab] item:offline ${id}`);
          setItem(offline);
          return;
        }
        logRequestFailure('item:get', e);
      });
  }, [state.status, id]);

  // Fetched here rather than inside the episode list, because the pill above it
  // needs to count them - and counting them is the only way to get the number
  // right. See below.
  // Once, and only for a film or an episode: a series has no single thing to
  // play, and the ref is what stops a re-render from starting it twice.
  const autoplayed = useRef(false);
  useEffect(() => {
    if (autoplay !== '1' || autoplayed.current || !item || item.Type === 'Series') return;
    autoplayed.current = true;
    play();
  }, [autoplay, item]);

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
      setOriginalLanguage(audioLanguageKey(details.originalLanguage));
      setTmdbArt({
        backdrop: details.backdropPath ? `${TMDB_ORIGINAL}${details.backdropPath}` : undefined,
        // The poster is drawn at 140pt, so the original would be a 2000px file
        // scaled down on the device for nothing.
        poster: details.posterPath ? `${TMDB_POSTER}${details.posterPath}` : undefined,
      });
    })();
    return () => { cancelled = true; };
  }, [item, i18n.language]);

  /**
   * Store this item on the device.
   *
   * The size comes from the server rather than being guessed, and it is said
   * out loud before anything starts: a remux is tens of gigabytes and the
   * phone should be asked, not told.
   */
  async function downloadItem() {
    if (state.status !== 'signed-in' || !item) return;
    if (download?.status === 'done') {
      Alert.alert(
        t('downloads.removeTitle'),
        t('downloads.removeBody', { title: item.Name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.delete'), style: 'destructive', onPress: () => removeDownload(item.Id) },
        ],
      );
      return;
    }
    // Pressing it while it is working is a request to stop, not a second
    // download - and stopping needs asking, because what arrived is thrown
    // away with it.
    if (download?.status === 'downloading' || download?.status === 'queued') {
      Alert.alert(
        t('downloads.stopTitle'),
        t('downloads.stopBody', { title: item.Name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('downloads.stop'), style: 'destructive', onPress: () => cancelDownload(item.Id) },
        ],
      );
      return;
    }

    const sources = await Jellyfin.getPlaybackInfo(state.auth.userId, item.Id).catch(() => []);
    const source = sources[0];
    const container = (source?.Container ?? 'mkv').split(',')[0].trim();
    // Size, or what the bitrate and runtime imply when the server does not say.
    const bytes = source?.Size
      ?? Math.round(((source?.Bitrate ?? 0) / 8) * Jellyfin.ticksToSeconds(item.RunTimeTicks ?? 0));

    // The subtitle streams are looked up here, where the server is known to be
    // reachable, and handed to the store to fetch alongside the media. A
    // sidecar track lives on the server and would be missing exactly when it
    // is wanted.
    const subs = (source?.MediaStreams ?? [])
      .filter(stream => stream.Type === 'Subtitle' && typeof stream.Index === 'number')
      .map(stream => ({
        index: stream.Index as number,
        label: stream.DisplayTitle ?? stream.Language ?? `Track ${stream.Index}`,
      }));

    Alert.alert(
      t('downloads.startTitle', { title: item.Name }),
      t('downloads.startBody', { size: formatBytes(bytes) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('downloads.start'),
          onPress: () => enqueueDownload(item, container, { mediaSourceId: source?.Id, subs }),
        },
      ],
    );
  }

  /**
   * Change the audio track of a transcode, which means a new stream.
   *
   * Direct play hands the player every track and it switches them itself. A
   * transcode carries exactly one, so the only way to hear another is to ask
   * the server to encode that one instead - a different URL, resumed at the
   * second the old one reached.
   */
  async function switchTranscodeAudio(streamIndex: number, positionSeconds: number) {
    if (state.status !== 'signed-in' || !item || !playback?.mediaSourceId) return;
    const [deviceId, prefs] = await Promise.all([getDeviceId(), loadPrefs()]);
    const ceiling = Math.round((prefs.maxBitrateMbps || 0) * 1_000_000) || FORCED_TRANSCODE_BITRATE;
    const url = Jellyfin.transcodeUrl(
      item.Id,
      playback.mediaSourceId,
      state.auth.accessToken,
      deviceId,
      ceiling,
      streamIndex,
    );
    console.log(`[jellylab] player:switchAudio index=${streamIndex} at=${Math.round(positionSeconds)}s`);
    setPlayback(p => (p ? { ...p, url, audioStreamIndex: streamIndex, startAt: positionSeconds } : p));
  }

  /**
   * The language this title was made in, fetched if it is not known yet.
   *
   * The screen looks TMDB up for artwork, but only for films and series - an
   * episode's still would be a lookup each, so episodes are skipped. That left
   * "original audio" resolving to nothing on exactly the content it exists
   * for: anime, watched by the episode.
   *
   * So an episode asks its series. One request, only when the preference is
   * Original, and remembered for the screen's lifetime.
   */
  async function resolveOriginalLanguage(): Promise<string | null> {
    if (originalLanguage) return originalLanguage;
    if (state.status !== 'signed-in' || !item) return null;

    let tmdb = Jellyfin.tmdbId(item);
    let kind: 'movie' | 'tv' = item.Type === 'Movie' ? 'movie' : 'tv';

    if (!tmdb && item.SeriesId) {
      const series = await Jellyfin.getItem(state.auth.userId, item.SeriesId).catch(() => null);
      tmdb = series ? Jellyfin.tmdbId(series) : null;
      kind = 'tv';
    }
    if (!tmdb) return null;

    const details = await Jellyseerr.getMediaDetails(kind, tmdb).catch(() => null);
    const resolved = audioLanguageKey(details?.originalLanguage);
    if (resolved) setOriginalLanguage(resolved);
    return resolved;
  }

  async function play() {
    if (state.status !== 'signed-in' || !item) return;

    /**
     * A stored copy wins, and it wins before anything asks the server.
     *
     * That is the whole point of a download: on a plane there is no
     * PlaybackInfo call to make, no transcode to negotiate and no stream URL
     * to build. The engine still has to be chosen, because an mkv on disk is
     * as unplayable to AVPlayer as an mkv on the server - but the choice can
     * be made from the container alone, which the download wrote down.
     */
    const local = localUriSync(item.Id);
    if (local) {
      const prefs = await loadPrefs();
      const stored = getDownloadSync(item.Id)?.meta;
      const engine: Engine = prefs.preferredEngine === 'vlc'
        ? 'vlc'
        // Not decidePlayback: its answer for a file AVPlayer cannot open is
        // "ask the server to transcode", and there may be no server.
        : decideEngine([{ Id: 'local', Container: stored?.container }]);
      /**
       * Subtitles for a stored file.
       *
       * What was fetched alongside the media is authoritative, since it is
       * what will still be here on a plane. When the server happens to be
       * reachable its list is used to fill in tracks stored before this
       * existed - a download made yesterday has no sidecars beside it, and
       * losing the subtitle picker was not the trade anyone agreed to.
       */
      let externalSubs = localSubtitlesSync(item.Id);
      if (externalSubs.length === 0) {
        const sources = await Jellyfin.getPlaybackInfo(state.auth.userId, item.Id).catch(() => []);
        externalSubs = (sources[0]?.MediaStreams ?? [])
          .filter(stream => stream.Type === 'Subtitle' && typeof stream.Index === 'number')
          .map(stream => ({
            index: stream.Index as number,
            label: stream.DisplayTitle ?? stream.Language ?? `Track ${stream.Index}`,
          }));
      }
      console.log(
        `[jellylab] player:local engine=${engine} container=${stored?.container ?? '?'}` +
        ` subs=${externalSubs.length}`,
      );
      setPlayback({
        url: local,
        engine,
        mode: 'direct',
        mediaSourceId: item.Id,
        externalSubs,
        audioStreams: [],
      });
      return;
    }

    const [deviceId, sources, prefs] = await Promise.all([
      getDeviceId(),
      Jellyfin.getPlaybackInfo(state.auth.userId, item.Id).catch(() => []),
      loadPrefs(),
    ]);
    // The setting goes into the decision rather than being applied on top of
    // it: forcing AVPlayer has to be able to change the mode as well as the
    // engine, since the whole point is a file it can only play transcoded.
    const decision = decidePlayback(sources, prefs.maxBitrateMbps, prefs.preferredEngine);
    const engine: Engine = decision.engine;
    const source = sources[0];
    // transcoding needs a MediaSourceId; without one we can only direct play
    const transcoding = decision.mode === 'transcode' && !!source?.Id && !!decision.maxBitrate;
    const mode: PlayMode = transcoding ? 'transcode' : 'direct';
    /**
     * Which language to ask for, resolved once for both engines.
     *
     * "Original" is not a language, it is a rule: whatever the show was made
     * in. TMDB knows - `ja` for Jujutsu Kaisen - and that beats a global
     * preference, which is either Japanese and wrong for a French film or
     * English and wrong for all anime.
     */
    const wantedAudio = prefs.audioLanguage === 'original'
      ? await resolveOriginalLanguage()
      : prefs.audioLanguage;

    // The transcode carries one audio track, so the choice has to reach the
    // server: inside the player there is nothing left to switch between.
    const audioIndex = transcoding
      ? preferredAudioIndex(
          (source?.MediaStreams ?? []).filter(stream => stream.Type === 'Audio'),
          wantedAudio ?? undefined,
        )
      : null;
    const url = transcoding
      ? Jellyfin.transcodeUrl(item.Id, source.Id, state.auth.accessToken, deviceId, decision.maxBitrate!, audioIndex)
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

    console.log(
      `[jellylab] player:decision engine=${engine} mode=${mode} preferred=${prefs.preferredEngine}` +
      ` container=${source?.Container ?? '?'} bitrate=${source?.Bitrate ?? 0}` +
      ` audioPref=${prefs.audioLanguage} wanted=${wantedAudio ?? 'none'} audioIndex=${audioIndex ?? 'server'}` +
      ` audioStreams=${JSON.stringify(audioStreams.map(a => ({ i: a.index, l: a.language })))}`,
    );
    setPlayback({
      url, engine, mode, mediaSourceId: source?.Id, externalSubs, audioStreams,
      audioStreamIndex: audioIndex,
      preferredAudioLanguage: wantedAudio ?? undefined,
    });
  }

  if (!item) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  if (playback) {
    return (
      <>
        {/*
          * The screen has to allow rotation before anything can rotate it.
          *
          * A native stack screen declares its own supported orientations, and
          * that beats an app-level lock - so `ScreenOrientation.lockAsync` was
          * being ignored rather than failing, which is why the fullscreen
          * button did nothing and nothing was logged. The plist has listed
          * both landscapes all along; it was this that said no.
          */}
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false, orientation: 'all' }} />
        <Player
          // The key is the URL: a new stream is a new player, which is what
          // makes the switch actually take effect rather than being ignored by
          // a component that thinks nothing changed.
          key={playback.url}
          config={playback}
          onSwitchAudio={switchTranscodeAudio}
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
          resumeSeconds={playback.startAt ?? Jellyfin.ticksToSeconds(item.UserData?.PlaybackPositionTicks ?? 0)}
          initialDuration={Jellyfin.ticksToSeconds(item.RunTimeTicks ?? 0)}
          onExit={() => setPlayback(null)}
          // AVPlayer failing and VLC quietly taking over is why "Always use
          // AVPlayer" looked like it did nothing. It still falls back - better
          // than a dead screen - but it says so first.
          onNativeError={() => {
            console.log('[jellylab] player:nativeFailed — falling back to VLC');
            setPlayback(p => (p ? { ...p, engine: 'vlc' } : p));
          }}
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
                  onPress={() => router.push('/sheet/cast')}
                  accessibilityLabel={t('player.castLabel')}
                  tint={castState === 'connected' ? colors.pink : undefined}
                />
                {/* Filled once it is here, the way the rest of the app says
                    "this one is yours". Pressing it again offers to delete. */}
                <CircleButton
                  icon={download?.status === 'done'
                    ? { ios: 'arrow.down.circle.fill', android: 'download_done', web: 'download_done' }
                    : downloading
                      ? { ios: 'stop.circle', android: 'stop', web: 'stop' }
                      : { ios: 'arrow.down.circle', android: 'download', web: 'download' }}
                  onPress={downloadItem}
                  // The button fills as the file arrives, so the thing you
                  // pressed is the thing that reports on itself.
                  progress={downloading ? downloadProgress : null}
                  accessibilityLabel={download?.status === 'done'
                    ? t('downloads.downloaded')
                    : downloading
                      ? t('downloads.downloading')
                      : t('downloads.label')}
                  tint={download?.status === 'done' ? colors.successBorder : undefined}
                />
              </ButtonRow>
              {/* Otherwise there is no way to tell: play() prefers the stored
                  file silently, and the only trace was a line in the log. */}
              {download?.status === 'done' ? (
                <Text style={styles.castHint}>{t('downloads.playingOffline')}</Text>
              ) : (
                <Text style={styles.castHint}>{t('player.castHint')}</Text>
              )}
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

function VLCEnginePlayer({ url, itemId, mediaSourceId, externalSubs, audioStreams, preferredAudioLanguage, delayKey, title, resumeSeconds, initialDuration, playMethod = 'DirectPlay', onExit }: {
  /** Already resolved by the screen, so "original" means something here too. */
  preferredAudioLanguage?: string;
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
  const router = useRouter();
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [ready, setReady] = useState(false);

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
        const ticks = Jellyfin.secondsToTicks(positionRef.current);
        rememberLocalPosition();
        Jellyfin.reportPlaybackStopped(itemId, ticks, playMethod)
          .catch(() => queueProgress(itemId, ticks));
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
    /**
     * The language comes resolved from the screen, so "original" is already a
     * real language by the time it gets here - Japanese for anime, French for
     * a French film - rather than a word this effect has to skip.
     */
    const byLanguage = preferredAudioLanguage
      ? audioChoices.find(t => matchesLanguage(t.language ?? t.label, preferredAudioLanguage))
      : undefined;
    const pick = byLastUsed ?? byLanguage;
    console.log(
      `[jellylab] player:audioPick wanted=${preferredAudioLanguage ?? 'none'}` +
      ` picked=${pick?.label ?? 'server default'}`,
    );
    // persist=false: an automatic choice should not overwrite what the user
    // last chose by hand, or every title would rewrite the preference.
    if (pick) applyAudioTrack(pick.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, vlcAudioTracks, preferredAudioLanguage]);

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
      // A stored copy first: it is the one that exists with no network, and it
      // is identical to what the server would send.
      const offline = localSubtitleSync(itemId, streamIndex);
      if (offline) {
        const cues = parseVtt(offline);
        setExternalCues(cues);
        console.log(`[jellylab] player:externalSub index=${streamIndex} stored cues=${cues.length}`);
        return;
      }

      const auth = await import('@/store/auth').then(m => m.loadJellyfinAuth());
      if (!auth) return;
      const url = Jellyfin.subtitleUrl(itemId, mediaSourceId, streamIndex, auth.accessToken, 'vtt');
      const vtt = await Jellyfin.fetchSubtitleVtt(url);
      const cues = parseVtt(vtt);
      setExternalCues(cues);
      // A track that fetches fine and parses to nothing looks exactly like one
      // that failed to fetch, and the two have different causes - so the log
      // says which happened, and how much came back.
      console.log(`[jellylab] player:externalSub index=${streamIndex} bytes=${vtt.length} cues=${cues.length}`);
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
      logRequestFailure(`player:externalSub index=${streamIndex}`, e);
      setExternalCues([]);
    }
  }

  /**
   * Keep the resume point on the device as well as on the server.
   *
   * Jellyfin owns this normally, and offline there is nobody to tell - so a
   * stored item remembers where it got to itself, and the meta file is what
   * the item screen reads when there is no server to ask.
   */
  function rememberLocalPosition() {
    if (!localUriSync(itemId)) return;
    saveLocalPosition(itemId, Jellyfin.secondsToTicks(positionRef.current));
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

  /**
   * The pickers are a route now, so opening one is: leave the payload, push.
   * The sheet closes itself once a choice is made, which is why none of these
   * callbacks says anything about closing.
   */
  function showSubtitleSheet() {
    openPlayerSheet({
      kind: 'vlcSubtitles',
      externalSubs,
      internalTracks: vlcTextTracks,
      activeExternalIndex: activeSubIndex,
      /**
       * One tick, always.
       *
       * The overlay and VLC's own track are separate pieces of state, and on
       * load they can both be set for a moment: our overlay is chosen from the
       * saved preference while VLC reselects the container's default track -
       * "Signs & Songs" here, since the file marks it default. The picker was
       * showing a tick against each. An external track wins, because that is
       * the one being drawn.
       */
      activeInternalId: activeSubIndex != null ? -1 : vlcTextTrackId,
      subDelayMs,
      delayEnabled: externalCues.length > 0,
      onDelayChange: changeSubDelay,
      onPickExternal: pickExternalSub,
      onPickInternal: pickInternalSub,
      // pickExternalSub(null) already forces a remount with textTrack -1.
      onOff: () => pickExternalSub(null),
    });
    router.push('/sheet/player');
  }

  function showAudioSheet() {
    openPlayerSheet({
      kind: 'vlcAudio',
      tracks: audioChoices,
      activeId: vlcAudioTrackId,
      declaredCount: audioStreams.length,
      onPick: applyAudioTrack,
    });
    router.push('/sheet/player');
  }

  function showSpeedSheet() {
    openPlayerSheet({ kind: 'speed', current: rate, rates: SPEEDS, onPick: changeSpeed });
    router.push('/sheet/player');
  }

  function changeSpeed(nextRate: number) {
    setRate(nextRate);
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
    } catch (e) {
      logRequestFailure('player:orientation', e);
    }
  }

  // Resume once loaded (initial resumeSeconds, or last position after remount)
  const onLoad = (e: any) => {
    setReady(true);
    const durSecs = (e?.duration ?? 0) / 1000;
    if (durSecs > 0) setDuration(durSecs);

    // Capture available internal text tracks from VLC.
    const rawTracks = Array.isArray(e?.textTracks) ? e.textTracks : [];
    console.log(`[jellylab] player:vlcTextTracks ${JSON.stringify(rawTracks)}`);
    const tracks = rawTracks.filter((t: any) => t && t.id != null && t.id !== -1);
    setVlcTextTracks(tracks);

    const rawAudio = Array.isArray(e?.audioTracks) ? e.audioTracks : [];
    console.log(`[jellylab] player:vlcAudioTracks ${JSON.stringify(rawAudio)}`);
    const audio = rawAudio.filter((t: any) => t && t.id != null && t.id !== -1);
    setVlcAudioTracks(audio);

    /**
     * Say which track is playing, even when nobody chose it.
     *
     * The picker ticks whatever `vlcAudioTrackId` holds, and that stayed at -1
     * until someone opened the picker and chose - so a file playing its own
     * default, which for these releases is the English dub, showed a list with
     * nothing ticked at all. VLC starts on the container's default, which is
     * the first track it reports.
     */
    if (vlcAudioTrackId === -1 && audio.length > 0) {
      setVlcAudioTrackId(audio[0].id);
    }

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
                  <TouchableOpacity style={styles.overlayIconBtn} onPress={showAudioSheet} activeOpacity={0.7}>
                    <SymbolView name={{ ios: 'waveform', android: 'graphic_eq', web: 'graphic_eq' }} tintColor={colors.text} size={22} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showSubtitleSheet} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'captions.bubble', android: 'closed_caption', web: 'closed_caption' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showSpeedSheet} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                {/*
                  * Present but dimmed, and it explains itself.
                  *
                  * VLC has no picture in picture, so this engine simply had no
                  * such button - which reads as the feature being broken
                  * rather than absent, especially on a library that is mostly
                  * mkv and therefore mostly VLC.
                  */}
                <TouchableOpacity
                  style={styles.overlayIconBtn}
                  onPress={() => Alert.alert(t('player.pipUnavailable'), t('player.pipUnavailableBody'))}
                  activeOpacity={0.7}
                >
                  <SymbolView
                    name={{ ios: 'pip.enter', android: 'picture_in_picture_alt', web: 'picture_in_picture_alt' }}
                    tintColor={colors.textDim}
                    size={22}
                  />
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
    </>
  );
}

/** Container, size and subtitle tracks, straight off the episode list. */
function episodeDownload(ep: any): { container: string; bytes: number; mediaSourceId?: string; subs: { index: number; label: string }[] } {
  const source = ep.MediaSources?.[0];
  return {
    container: (source?.Container ?? 'mkv').split(',')[0].trim(),
    bytes: source?.Size ?? 0,
    mediaSourceId: source?.Id,
    subs: (source?.MediaStreams ?? [])
      .filter((stream: any) => stream.Type === 'Subtitle' && typeof stream.Index === 'number')
      .map((stream: any) => ({
        index: stream.Index as number,
        label: stream.DisplayTitle ?? stream.Language ?? `Track ${stream.Index}`,
      })),
  };
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
  const { t, i18n } = useTranslation();
  const { entries: downloads } = useDownloads();
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

  function downloadSeason() {
    const stored = new Set(downloads.map(entry => entry.meta.itemId));
    const pending = episodes.filter(ep => !stored.has(ep.Id));
    if (pending.length === 0) {
      Alert.alert(t('downloads.season'), t('downloads.seasonNone'));
      return;
    }

    const total = pending.reduce((sum, ep) => sum + episodeDownload(ep).bytes, 0);
    Alert.alert(
      t('downloads.seasonTitle', { count: pending.length }),
      t('downloads.seasonBody', { size: formatBytes(total) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('downloads.start'),
          onPress: () => {
            for (const ep of pending) {
              const { container, mediaSourceId, subs } = episodeDownload(ep);
              enqueueDownload(ep, container, { mediaSourceId, subs });
            }
          },
        },
      ],
    );
  }

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

      {/*
        * A season is the unit people watch, so it is the unit they want on the
        * phone. Queued rather than fired at once - see the store.
        */}
      {episodes.length > 0 ? (
        <TouchableOpacity
          style={styles.seasonDownload}
          onPress={downloadSeason}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <SymbolView
            name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }}
            tintColor={colors.text}
            size={17}
          />
          <Text style={styles.seasonDownloadText}>{t('downloads.season')}</Text>
        </TouchableOpacity>
      ) : null}

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
  onSwitchAudio,
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
  /** Called with a Jellyfin stream index when the audio track should change. */
  onSwitchAudio: (streamIndex: number, positionSeconds: number) => void;
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
          audioStreams={config.audioStreams}
          activeAudioStreamIndex={config.audioStreamIndex}
          onSwitchAudio={config.mode === 'transcode' ? onSwitchAudio : undefined}
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
          preferredAudioLanguage={config.preferredAudioLanguage}
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

function NativePlayer({ url, itemId, mediaSourceId, externalSubs, audioStreams, activeAudioStreamIndex, onSwitchAudio, title, subtitle, artworkUri, resumeSeconds, playMethod = 'DirectPlay', onError, onExit }: {
  url: string;
  itemId: string;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  /** The server's audio tracks - the only list that means anything on a transcode. */
  audioStreams?: AudioStream[];
  activeAudioStreamIndex?: number | null;
  /** Set only when transcoding: switching means a new stream from the server. */
  onSwitchAudio?: (streamIndex: number, positionSeconds: number) => void;
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
  const router = useRouter();
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
        saveLocalPosition(itemId, pos);
        Jellyfin.reportPlaybackStopped(itemId, pos, playMethod)
          .catch(() => queueProgress(itemId, pos));
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
    } catch (e) {
      logRequestFailure('player:orientation', e);
    }
  }

  const viewRef = useRef<VideoView>(null);

  /**
   * Picture in picture belongs to the view, not the player.
   *
   * `player.startPictureInPicture` does not exist, so the button called
   * nothing at all. The method is on the VideoView's ref, and it only works in
   * a binary built with the expo-video plugin's supportsPictureInPicture -
   * which is why app.json changed alongside this.
   */
  function togglePip() {
    viewRef.current?.startPictureInPicture().catch(e => logRequestFailure('player:pip', e));
  }

  /** Same handoff as the VLC player's, with the live player object attached. */
  function showTracksSheet() {
    openPlayerSheet({
      kind: 'tracks',
      player,
      externalSubs,
      activeExternalSubIndex: activeSubIndex,
      onPickExternal: pickExternalSub,
      /**
       * On a transcode the file has one audio track, so the picker offers the
       * server's list instead of the player's - and choosing one asks for a
       * new stream rather than flipping a track that is not there.
       */
      serverAudio: onSwitchAudio
        ? {
            tracks: audioStreams ?? [],
            activeIndex: activeAudioStreamIndex ?? null,
            onPick: (streamIndex: number) => onSwitchAudio(streamIndex, player.currentTime ?? 0),
          }
        : undefined,
    });
    router.push('/sheet/player');
  }

  function showSpeedSheet() {
    openPlayerSheet({ kind: 'speed', current: speed, rates: SPEEDS, onPick: changeSpeed });
    router.push('/sheet/player');
  }

  function changeSpeed(rate: number) {
    try {
      player.playbackRate = rate;
      setSpeed(rate);
    } catch {}
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
          ref={viewRef}
          player={player}
          style={{ flex: 1 }}
          fullscreenOptions={{ enable: true, autoExitOnRotate: false }}
          allowsPictureInPicture
          // What people mean by picture in picture: swipe home and the video
          // carries on in a corner. The button is the explicit version of the
          // same thing.
          startsPictureInPictureAutomatically
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
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showTracksSheet} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'captions.bubble', android: 'closed_caption', web: 'closed_caption' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showSpeedSheet} activeOpacity={0.7}>
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
  modalTitle: { ...type.h1, color: colors.text },
  modalEmpty: { ...type.small, color: colors.textDim, paddingVertical: spacing.md, textAlign: 'center' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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

  seasonDownload: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  seasonDownloadText: { ...type.small, color: colors.text, fontWeight: '600' },
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
