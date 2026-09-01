import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, PixelRatio, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import GoogleCast, { useCastState, useRemoteMediaClient } from 'react-native-google-cast';

import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { ButtonRow, CircleButton, PrimaryButton } from '@/components/AppleButton';
import { decideEngine, decidePlayback, FORCED_TRANSCODE_BITRATE, type Engine, type PlayMode } from '@/player/decide';
import { audioLanguageKey, preferredAudioIndex } from '@/player/lang';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/store/auth';
import { loadPrefs } from '@/store/prefs';
import { useDownload } from '@/hooks/useDownloads';
import { formatBytes } from '@/lib/bytes';
import { qualityFromHeight, qualityFromLabel } from '@/lib/quality';
import {
  cancelDownload,
  enqueueDownload,
  getDownloadSync,
  offlineItemSync,
  localSubtitlesSync,
  localUriSync,
  removeDownload,
} from '@/store/downloads';
import { drainProgressOutbox } from '@/store/outbox';
import { confirmSpace } from '@/store/downloadGuard';
import { IS_TABLET } from '@/lib/device';
import { logRequestFailure } from '@/lib/errorLog';
import { jellyfinKind, kindKey } from '@/lib/kind';
import { metadataLanguage, plainText } from '@/lib/text';
import { OverviewCard } from '@/components/OverviewCard';
import { type PlaybackConfig } from '@/player/config';
import { Player } from '@/player/Player';
import { resumeSecondsFor } from '@/player/progress';
import { SeriesEpisodes } from '@/components/SeriesEpisodes';
import { UpNextCard } from '@/components/UpNextCard';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

/**
 * A tablet, where a film in portrait is a reasonable thing to want.
 *
 * Narrowed on OS because isPad only exists on the iOS half of Platform, and
 * the type is a union across every platform React Native supports.
 */




export default function ItemScreen() {
  // `play` is set by the long-press menu on a poster, which starts playback
  // without making you find the button on the screen it is opening.
  const { id, play: autoplay } = useLocalSearchParams<{ id: string; play?: string }>();
  const router = useRouter();
  const { state } = useAuth();
  // Hoisted so the effects below depend on the id itself. Depending on
  // state.status alone missed a change of server, which keeps the status
  // 'signed-in' while the user behind it becomes someone else.
  const userId = state.status === 'signed-in' ? state.auth.userId : null;

  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);
  /** The episode after this one, and whether this one has finished. */
  const [nextEpisode, setNextEpisode] = useState<JellyfinItem | null>(null);
  const [ended, setEnded] = useState(false);
  /**
   * What the player is actually playing, when that is no longer what the
   * screen is for.
   *
   * Up Next hands the player the following episode in place rather than
   * navigating to it. The route still names the episode you opened, and this
   * names the one running - they part company for as long as you keep
   * watching, and the route is brought back into line on the way out.
   */
  const [playingItem, setPlayingItem] = useState<JellyfinItem | null>(null);

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
  /** "Full HD" and friends, from the file the server holds. */
  const video = item?.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Video');
  const qualityKey = qualityFromHeight(video?.Height) ?? qualityFromLabel(video?.DisplayTitle);
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
    // Reads the offline store when the server did not answer. Disk is the
    // external system here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setItem(stored);
  }, [download, item, id]);

  useEffect(() => {
    if (!userId || !id) return;
    Jellyfin.getItem(userId, id)
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
  }, [userId, id]);

  // Fetched here rather than inside the episode list, because the pill above it
  // needs to count them - and counting them is the only way to get the number
  // right. See below.
  // Once, and only for a film or an episode: a series has no single thing to
  // play, and the ref is what stops a re-render from starting it twice.
  // Looked up when playback starts rather than on every visit to an item
  // screen: only the card at the end ever wants it.
  // Asked of whatever is playing, not of the screen: after Up Next hands over
  // an episode in place, the one that follows is the one after *that*.
  useEffect(() => {
    const from = playingItem ?? item;
    if (!playback || !from || from.Type !== 'Episode' || !from.SeriesId || state.status !== 'signed-in') {
      return;
    }
    let cancelled = false;
    Jellyfin.getNextEpisode(state.auth.userId, from.SeriesId, from.Id)
      .then(next => { if (!cancelled) setNextEpisode(next); })
      .catch(() => { if (!cancelled) setNextEpisode(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, item?.Id, playingItem?.Id]);

  const autoplayed = useRef(false);

  /*
   * Everything here belongs to one item, and the screen is reused when only
   * the [id] changes - which is exactly what Up Next does on its way to the
   * next episode. Left alone, the next episode inherits the last one's
   * playback and goes on drawing it: two players stacked, the finished one on
   * top, the new one revealed by pressing Back.
   *
   * The item is cleared too. It is replaced by a fetch rather than emptied, so
   * for as long as that request is in flight the screen still holds the
   * episode that just ended - and something has to stop the autoplay latch
   * starting it over.
   */
  const routedId = useRef(id);
  useEffect(() => {
    if (routedId.current === id) return;
    routedId.current = id;
    setItem(null);
    setPlayback(null);
    setEnded(false);
    setNextEpisode(null);
    setPlayingItem(null);
    autoplayed.current = false;
  }, [id]);


  useEffect(() => {
    // item.Id !== id is the stale one: the item on hand is still the previous
    // episode while the new one is being fetched, and playing it would restart
    // what has just finished.
    if (autoplay !== '1' || autoplayed.current || !item || item.Id !== id || item.Type === 'Series') {
      return;
    }
    autoplayed.current = true;
    play();
  // Autoplay fires once, guarded by a ref; depending on play would rebuild
  // the effect on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, item, id]);

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
   * One line per playback rather than one per render.
   *
   * This log lived in the render body, so it printed again every time the
   * screen re-rendered - nine times for a single episode - and a line saying
   * "mount" over and over reads as the player rebuilding itself, which is
   * exactly the bug it exists to rule out. It said nothing untrue; it was
   * just answering a different question than its name implies.
   *
   * The last line is remembered rather than a mounted flag, so a genuine
   * change - Up Next handing over an episode, a switch between engines -
   * still prints, while a re-render carrying the same values stays quiet.
   */
  const loggedPlayback = useRef<string | null>(null);
  useEffect(() => {
    if (!playback) {
      loggedPlayback.current = null;
      return;
    }
    const playing = playingItem ?? item;
    if (!playing) return;
    const line =
      `[jellylab] player:mount item=${playing.Id} engine=${playback.engine}` +
      ` resume=${Math.round(resumeSecondsFor(playback.startAt, playing.UserData?.PlaybackPositionTicks))}s` +
      ` runtime=${Math.round(Jellyfin.ticksToSeconds(playing.RunTimeTicks ?? 0))}s`;
    if (loggedPlayback.current === line) return;
    loggedPlayback.current = line;
    console.log(line);
  }, [playback, playingItem, item]);

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
          // The cap is checked after the size is confirmed rather than before,
          // so the two dialogs cannot both be waiting - and so somebody who
          // was going to cancel anyway is never asked to free space first.
          onPress: async () => {
            if (await confirmSpace(bytes)) {
              enqueueDownload(item, container, { mediaSourceId: source?.Id, subs });
            }
          },
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
  async function resolveOriginalLanguage(target: JellyfinItem | null): Promise<string | null> {
    if (originalLanguage) return originalLanguage;
    if (state.status !== 'signed-in' || !target) return null;

    let tmdb = Jellyfin.tmdbId(target);
    let kind: 'movie' | 'tv' = target.Type === 'Movie' ? 'movie' : 'tv';

    if (!tmdb && target.SeriesId) {
      const series = await Jellyfin.getItem(state.auth.userId, target.SeriesId).catch(() => null);
      tmdb = series ? Jellyfin.tmdbId(series) : null;
      kind = 'tv';
    }
    if (!tmdb) return null;

    const details = await Jellyseerr.getMediaDetails(kind, tmdb).catch(() => null);
    const resolved = audioLanguageKey(details?.originalLanguage);
    if (resolved) setOriginalLanguage(resolved);
    return resolved;
  }

  /**
   * Play something, by default whatever this screen is for.
   *
   * Taking the item as an argument is what lets Up Next hand the player
   * the following episode without leaving the screen: the alternative was
   * navigating, which tears the player down, shows the detail page of the
   * episode nobody asked for, and builds a new player from nothing.
   */
  async function play(requested: JellyfinItem | null = item) {
    /*
     * Anything without an id is not an item, whatever its type says.
     *
     * This is not hypothetical: `onPress={play}` handed it a gesture event,
     * which has no id, and every URL built from it asked the server for
     * /Items/undefined - a 400 on PlaybackInfo, an empty source list, and a
     * player pointed at a stream that cannot exist. Falling back to the
     * screen's own item makes the wrong call harmless.
     */
    const target = requested && typeof requested.Id === 'string' ? requested : item;
    if (state.status !== 'signed-in' || !target) return;

    /**
     * A stored copy wins, and it wins before anything asks the server.
     *
     * That is the whole point of a download: on a plane there is no
     * PlaybackInfo call to make, no transcode to negotiate and no stream URL
     * to build. The engine still has to be chosen, because an mkv on disk is
     * as unplayable to AVPlayer as an mkv on the server - but the choice can
     * be made from the container alone, which the download wrote down.
     */
    const local = localUriSync(target.Id);
    if (local) {
      const prefs = await loadPrefs();
      const stored = getDownloadSync(target.Id)?.meta;
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
      let externalSubs = localSubtitlesSync(target.Id);
      if (externalSubs.length === 0) {
        const sources = await Jellyfin.getPlaybackInfo(state.auth.userId, target.Id).catch(() => []);
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
        mediaSourceId: target.Id,
        externalSubs,
        audioStreams: [],
      });
      return;
    }

    const [deviceId, sources, prefs] = await Promise.all([
      getDeviceId(),
      Jellyfin.getPlaybackInfo(state.auth.userId, target.Id).catch(() => []),
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
      ? await resolveOriginalLanguage(target)
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
      ? Jellyfin.transcodeUrl(target.Id, source.Id, state.auth.accessToken, deviceId, decision.maxBitrate!, audioIndex)
      : Jellyfin.streamUrl(target.Id, state.auth.accessToken, deviceId);
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
              title: target.Name,
              images: target.ImageTags?.Primary
                ? [{ url: Jellyfin.imageUrl(target.Id, target.ImageTags.Primary, 'Primary', 600) }]
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
    const trickplayInfo = Jellyfin.trickplayFor(target, source?.Id);
    setPlayback({
      url, engine, mode, mediaSourceId: source?.Id, externalSubs, audioStreams,
      audioStreamIndex: audioIndex,
      preferredAudioLanguage: wantedAudio ?? undefined,
      originalLanguage: originalLanguage ?? undefined,
      trickplay: trickplayInfo ? { info: trickplayInfo, token: state.auth.accessToken } : null,
    });
  }

  if (!item) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  /**
   * Close the player, and leave the screen showing what was actually watched.
   *
   * Up Next changes what is playing without changing the route, so after a few
   * episodes the two disagree. Squaring them here means Back lands on the
   * episode you stopped on rather than the one you opened an hour ago.
   */
  function leavePlayer() {
    setPlayback(null);
    if (playingItem && playingItem.Id !== item?.Id) {
      router.replace(`/item/${playingItem.Id}`);
    }
  }

  if (playback) {
    // item is non-null by here, so this is the one the player is working from.
    const playing = playingItem ?? item;
    return (
      <>
        {/*
          * The screen declares its own supported orientations, and that beats
          * an app-level lock - which is why `ScreenOrientation.lockAsync` was
          * being ignored rather than failing, back when this said portrait.
          *
          * A phone says landscape and means it. Saying "all" and then turning
          * the screen with a JS lock worked, but the lock does not survive
          * backgrounding: iOS handed the app back in portrait and the film
          * visibly rotated itself every time you returned to it. Declared
          * here, iOS restores the screen the right way round on its own and
          * there is nothing to correct.
          *
          * A tablet keeps both. There is room for a film in portrait on an
          * iPad and people watch that way.
          */}
        <Stack.Screen
          options={{
            headerShown: false,
            gestureEnabled: false,
            orientation: IS_TABLET ? 'all' : 'landscape',
          }}
        />
        <Player
          // The key is the URL: a new stream is a new player, which is what
          // makes the switch actually take effect rather than being ignored by
          // a component that thinks nothing changed.
          key={playback.url}
          config={playback}
          onSwitchAudio={switchTranscodeAudio}
          // Everything below names what is playing, which after Up Next hands
          // over an episode is no longer what the screen is for. Progress in
          // particular: reporting it against the route would credit the wrong
          // episode for every one watched after the first.
          itemId={playing.Id}
          delayKey={playing.SeriesId ?? playing.Id}
          title={playing.Name}
          // What the lock screen shows under the title: the series for an
          // episode, the year for a film.
          subtitle={playing.Type === 'Episode'
            ? [playing.SeriesName, playing.ParentIndexNumber != null && playing.IndexNumber != null
                ? `S${playing.ParentIndexNumber} · E${playing.IndexNumber}` : null].filter(Boolean).join(' · ')
            : String(playing.ProductionYear ?? '')}
          artworkUri={playingItem ? undefined : (tmdbArt.poster ?? (playing.ImageTags?.Primary
            ? Jellyfin.imageUrl(playing.Id, playing.ImageTags.Primary, 'Primary', 600)
            : undefined))}
          resumeSeconds={resumeSecondsFor(playback.startAt, playing.UserData?.PlaybackPositionTicks)}
          initialDuration={Jellyfin.ticksToSeconds(playing.RunTimeTicks ?? 0)}
          onExit={leavePlayer}
          // A film, or a last episode, still just closes.
          onEnded={nextEpisode ? () => setEnded(true) : leavePlayer}
          // AVPlayer failing and VLC quietly taking over is why "Always use
          // AVPlayer" looked like it did nothing. It still falls back - better
          // than a dead screen - but it says so first.
          onNativeError={() => {
            console.log('[jellylab] player:nativeFailed — falling back to VLC');
            setPlayback(p => (p ? { ...p, engine: 'vlc' } : p));
          }}
        />
        {/*
          * Drawn over the player rather than inside either engine, so there is
          * one card and not one per engine. Replacing the route rather than
          * pushing keeps Back going where it went before, instead of walking
          * back through a night of episodes.
          */}
        {ended && nextEpisode ? (
          <UpNextCard
            item={nextEpisode}
            onPlay={() => {
              /*
               * Handed to the player in place, rather than navigated to.
               *
               * Going through the router meant leaving this screen, so the
               * player came down, the next episode's detail page appeared for
               * as long as its request took, and a fresh player was built to
               * replace the one just discarded. Playing it here keeps the
               * screen, and only the source changes.
               */
              console.log(
                `[jellylab] player:handover to=${nextEpisode.Id}` +
                ` s${nextEpisode.ParentIndexNumber}e${nextEpisode.IndexNumber}` +
                ` resumeTicks=${nextEpisode.UserData?.PlaybackPositionTicks ?? 0}` +
                ` played=${nextEpisode.UserData?.Played ?? false}`,
              );
              setEnded(false);
              setPlayingItem(nextEpisode);
              setNextEpisode(null);
              play(nextEpisode).catch(e => logRequestFailure('player:handover', e));
            }}
            onDismiss={() => { setEnded(false); leavePlayer(); }}
          />
        ) : null}
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
          /*
           * Portrait, said out loud, because the player is this same route.
           *
           * When playback ends the branch above simply stops rendering, and a
           * screen that declares nothing leaves the last mask standing - so
           * backing out of a film left this page, and everything reached from
           * it, on its side. The root stack's portrait cannot help here: this
           * screen overrode it, and an override that disappears is not the
           * same as one that reverts.
           */
          orientation: IS_TABLET ? 'all' : 'portrait',
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
                {/* Full HD, not "1080p - HEVC - SDR". Nobody watching has ever
                    needed the codec on the poster. */}
                {qualityKey ? (
                  <View style={styles.pill}><Text style={styles.pillText}>{t(qualityKey)}</Text></View>
                ) : null}
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
                  // Wrapped, not passed: play() takes what to play, and a press
                  // handler is called with a gesture event - which would arrive
                  // as the thing to play and ask the server for /Items/undefined.
                  onPress={() => play()}
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

  speedLabel: { color: colors.text, ...type.small, fontWeight: '700' },
  overlayBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },


  /*
   * One place, always.
   *
   * The line used to jump from 40 to 130 the moment the controls appeared and
   * back again when they faded, so a tap anywhere on the screen made the
   * subtitles hop while you were reading them. They sit still now and the
   * controls are drawn over the top - which is what the layering is for:
   * picture, then subtitles, then controls.
   */
});
