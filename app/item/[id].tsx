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

import * as Jellyfin from '@/api/jellyfin';
import { decidePlayback, type Engine, type PlayMode } from '@/player/decide';
import { parseVtt, findActiveCue, type VttCue } from '@/player/vtt';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/store/auth';
import { loadPrefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

type PlaybackConfig = {
  url: string;
  engine: Engine;
  mode: PlayMode;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
};

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);

  const castClient = useRemoteMediaClient();
  const castState = useCastState();
  const [castPickerOpen, setCastPickerOpen] = useState(false);
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

    setPlayback({ url, engine, mode, mediaSourceId: source?.Id, externalSubs });
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
          title={item.Name}
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
  const backdropPx = Math.min(HERO_MAX_PX, Math.round(screenWidth * PixelRatio.get()));

  // Grows on a downward pull instead of leaving a black bar above it. Scaling
  // is centre-anchored, so the translate cancels the half that would push the
  // top edge off screen and all the growth goes downward. Clamped on the right
  // so ordinary upward scrolling keeps the existing behaviour.
  const heroStretch = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [-HERO_HEIGHT, 0],
          outputRange: [-HERO_HEIGHT / 2, 0],
          extrapolateLeft: 'extend' as const,
          extrapolateRight: 'clamp' as const,
        }),
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
          headerBackTitle: 'Back',
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
          <Animated.View style={[styles.heroBackdrop, heroStretch]}>
            {backdrop ? (
              <Image
                source={{ uri: Jellyfin.imageUrl(item.Id, backdrop, 'Backdrop', backdropPx) }}
                style={styles.backdrop}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View style={[styles.backdrop, { backgroundColor: colors.bgElevated }]} />
            )}
          </Animated.View>
          {/* Flat shade so a bright backdrop does not wash out the title,
              matching the library hero. */}
          <View style={styles.heroShade} />
          {/* Near-black under the status bar so the Dynamic Island cutout does
              not sit against a bright frame. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.45)', 'transparent']}
            locations={[0, 0.55, 1]}
            style={[StyleSheet.absoluteFill, { top: HERO_BLEED, height: 130, bottom: undefined }]}
          />
          <LinearGradient
            colors={[colors.scrimTop, colors.bg]}
            locations={[0, 1]}
            style={[StyleSheet.absoluteFill, { top: HERO_BLEED }]}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.headerRow}>
            {primary ? (
              <Image
                source={{ uri: Jellyfin.imageUrl(item.Id, primary, 'Primary', 400) }}
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
                {item.ProductionYear ? (
                  <View style={styles.pill}><Text style={styles.pillText}>{item.ProductionYear}</Text></View>
                ) : null}
                {runtimeMin ? (
                  <View style={styles.pill}><Text style={styles.pillText}>{runtimeMin}m</Text></View>
                ) : null}
                <View style={styles.pill}><Text style={styles.pillText}>{item.Type}</Text></View>
              </View>
            </View>
          </View>

          {item.Type !== 'Series' ? (
            <>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.playBtn} onPress={play} activeOpacity={0.85}>
                  <Text style={styles.playBtnText}>▶  Play</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.castChip}
                  onPress={() => setCastPickerOpen(true)}
                  activeOpacity={0.75}
                >
                  <SymbolView
                    name={{ ios: 'tv.badge.wifi', android: 'cast', web: 'cast' }}
                    tintColor={castState === 'connected' ? colors.pink : colors.text}
                    size={26}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.castHint}>
                Cast: {castState ?? 'sdk-not-ready'} · AirPlay picker is inside the player
              </Text>
            </>
          ) : null}

          {item.Overview ? (
            <View style={styles.overviewCard}>
              <Text style={styles.sectionLabel}>Overview</Text>
              <Text style={styles.overview}>{item.Overview}</Text>
            </View>
          ) : null}

          {item.Type === 'Series' && state.status === 'signed-in' ? (
            <SeriesEpisodes seriesId={item.Id} userId={state.auth.userId} />
          ) : null}
        </View>
      </Animated.ScrollView>
      <CastPickerModal visible={castPickerOpen} onClose={() => setCastPickerOpen(false)} />
    </View>
  );
}

function VLCEnginePlayer({ url, itemId, mediaSourceId, externalSubs, title, resumeSeconds, initialDuration, playMethod = 'DirectPlay', onExit }: {
  url: string;
  itemId: string;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
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

  // Keep positionRef synced so background/foreground can restore.
  useEffect(() => { positionRef.current = position; }, [position]);

  // Handle app background/foreground: remount VLC on foreground so the
  // video surface reattaches (VLC on iOS drops the surface in background,
  // audio keeps playing, and video stays black on return).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Force remount to reattach video surface
        setVlcKey(k => k + 1);
        setReady(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Report progress to Jellyfin
  useEffect(() => {
    Jellyfin.reportPlaybackStart(itemId, Jellyfin.secondsToTicks(resumeSeconds), playMethod).catch(() => {});
    return () => {
      try {
        Jellyfin.reportPlaybackStopped(itemId, Jellyfin.secondsToTicks(position), playMethod).catch(() => {});
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply subtitle prefs + auto-select last-used or preferred language sub.
  useEffect(() => {
    (async () => {
      const prefs = await loadPrefs();
      const sizeMap = { sm: 14, md: 18, lg: 24 } as const;
      setSubFontSize(sizeMap[prefs.subtitleSize] ?? 18);

      if (prefs.lastSubLabel && prefs.lastSubLabel !== 'off') {
        const exact = externalSubs.find(s => s.label === prefs.lastSubLabel);
        if (exact) {
          pickExternalSub(exact.index, false);
          return;
        }
      }
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
        const match = externalSubs.find(s => needles.some(n => s.label.toLowerCase().includes(n)));
        if (match) pickExternalSub(match.index, false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track active cue for external subs
  useEffect(() => {
    if (externalCues.length === 0) {
      if (activeCue) setActiveCue(null);
      return;
    }
    const cue = findActiveCue(externalCues, position);
    if (cue !== activeCue) setActiveCue(cue);
  }, [position, externalCues, activeCue]);

  async function pickExternalSub(streamIndex: number | null, persistPref = true) {
    setActiveSubIndex(streamIndex);
    // Always disable VLC's internal track when we render an external overlay
    // (or when explicitly turning off), otherwise both would be drawn.
    // VLC ignores the textTrack prop when going from auto-selected -> -1,
    // so force a remount so it starts fresh with no internal subs.
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
    setVlcTextTrackId(trackId);
    setActiveSubIndex(null);
    setExternalCues([]);
    setActiveCue(null);
  }

  useEffect(() => {
    const id = setInterval(() => {
      try {
        Jellyfin.reportPlaybackProgress(itemId, Jellyfin.secondsToTicks(position), paused, playMethod).catch(() => {});
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [itemId, position, paused]);

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

    // If we want subs off (vlcTextTrackId === -1) but VLC just autoplayed
    // with a default embedded track selected, the -1 prop from initial
    // render was silently ignored. Ping-pong through a real track id to
    // force VLC to actually apply -1.
    if (vlcTextTrackId === -1 && tracks.length > 0) {
      setTimeout(() => {
        setVlcTextTrackId(tracks[0].id);
        setTimeout(() => setVlcTextTrackId(-1), 80);
      }, 300);
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
      <VlcSubsModal
        visible={subsOpen}
        externalSubs={externalSubs}
        internalTracks={vlcTextTracks}
        activeExternalIndex={activeSubIndex}
        activeInternalId={vlcTextTrackId}
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
  onPickExternal, onPickInternal, onOff, onClose,
}: {
  visible: boolean;
  externalSubs: { index: number; label: string }[];
  internalTracks: { id: number; name?: string }[];
  activeExternalIndex: number | null;
  activeInternalId: number;
  onPickExternal: (index: number) => void;
  onPickInternal: (id: number) => void;
  onOff: () => void;
  onClose: () => void;
}) {
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
          <Text style={styles.modalTitle}>Subtitles</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {externalSubs.length === 0 && internalTracks.length === 0 ? (
              <Text style={styles.modalEmpty}>No subtitle tracks available</Text>
            ) : (
              <>
                <TrackRow label="Off" selected={isOff} onPress={onOff} />
                {internalTracks.length > 0 ? <SubGroupLabel>Embedded</SubGroupLabel> : null}
                {internalTracks.map(t => (
                  <TrackRow
                    key={`int-${t.id}`}
                    label={cleanSubLabel(t.name ?? `Track ${t.id}`)}
                    selected={activeInternalId === t.id}
                    onPress={() => onPickInternal(t.id)}
                  />
                ))}
                {externalSubs.length > 0 ? <SubGroupLabel>External</SubGroupLabel> : null}
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
          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>Close</Text>
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
          <Text style={styles.modalTitle}>Subtitles</Text>
          {externalSubs.length === 0 ? (
            <Text style={styles.modalEmpty}>No external subtitle tracks available</Text>
          ) : (
            <>
              <TrackRow label="Off" selected={activeIndex == null} onPress={() => onPick(null)} />
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
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CastPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
            <Text style={styles.modalTitle}>Cast to</Text>
            {scanning ? <ActivityIndicator color={colors.text} /> : null}
          </View>
          <Text style={styles.modalSub}>State: {castState ?? 'unknown'}</Text>

          {castState === 'connected' ? (
            <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect} activeOpacity={0.8}>
              <Text style={styles.disconnectText}>Disconnect current session</Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ marginTop: spacing.md }}>
            {devices.length === 0 && !scanning ? (
              <Text style={styles.modalEmpty}>No devices found on this network.</Text>
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
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SeriesEpisodes({ seriesId, userId }: { seriesId: string; userId: string }) {
  const router = useRouter();
  const [seasons, setSeasons] = useState<any[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEps, setLoadingEps] = useState(false);

  useEffect(() => {
    Jellyfin.getSeasons(userId, seriesId)
      .then(list => {
        setSeasons(list);
        const first = list[0];
        if (first) setActiveSeasonId(first.Id);
      })
      .finally(() => setLoading(false));
  }, [seriesId, userId]);

  useEffect(() => {
    if (!activeSeasonId) return;
    setLoadingEps(true);
    Jellyfin.getEpisodes(userId, seriesId, activeSeasonId)
      .then(setEpisodes)
      .finally(() => setLoadingEps(false));
  }, [activeSeasonId, seriesId, userId]);

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
                    {ep.IndexNumber != null ? `${ep.IndexNumber}. ` : ''}{ep.Name}
                  </Text>
                  <Text style={styles.epMeta}>
                    {runtimeMin ? `${runtimeMin}m` : ''}
                    {ep.PremiereDate ? ` · ${ep.PremiereDate.slice(0, 10)}` : ''}
                  </Text>
                  {ep.Overview ? <Text style={styles.epOverview} numberOfLines={2}>{ep.Overview}</Text> : null}
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
  title,
  resumeSeconds,
  initialDuration,
  onExit,
  onNativeError,
}: {
  config: PlaybackConfig;
  itemId: string;
  title: string;
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

function NativePlayer({ url, itemId, mediaSourceId, externalSubs, title, resumeSeconds, playMethod = 'DirectPlay', onError, onExit }: {
  url: string;
  itemId: string;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  title: string;
  resumeSeconds: number;
  playMethod?: Jellyfin.PlayMethod;
  onError: () => void;
  onExit: () => void;
}) {
  const player = useVideoPlayer(url, p => {
    if (resumeSeconds > 0) {
      try { p.currentTime = resumeSeconds; } catch {}
    }
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

          <Text style={styles.modalTitle}>Subtitles</Text>
          {!hasAnySub ? (
            <Text style={styles.modalEmpty}>No subtitle tracks available</Text>
          ) : (
            <>
              <TrackRow
                label="Off"
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

          <Text style={[styles.modalTitle, { marginTop: spacing.lg }]}>Audio</Text>
          {audios.length === 0 ? (
            <Text style={styles.modalEmpty}>No alternate audio tracks</Text>
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
            <Text style={styles.modalCloseText}>Close</Text>
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
          <Text style={styles.modalTitle}>Playback speed</Text>
          {SPEEDS.map(rate => (
            <TrackRow
              key={rate}
              label={`${rate}x${rate === 1 ? ' (Normal)' : ''}`}
              selected={Math.abs(current - rate) < 0.01}
              onPress={() => onPick(rate)}
            />
          ))}
          <TouchableOpacity style={styles.modalClose} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseText}>Close</Text>
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
  heroShade: { position: 'absolute', top: HERO_BLEED, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${HERO_SHADE})` },
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
  playBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: colors.accentContrast, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
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
