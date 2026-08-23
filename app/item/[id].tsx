import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VLCPlayer } from 'react-native-vlc-media-player';
import GoogleCast, { useCastState, useRemoteMediaClient } from 'react-native-google-cast';
import { SymbolView } from 'expo-symbols';
import * as ScreenOrientation from 'expo-screen-orientation';

import * as Jellyfin from '@/api/jellyfin';
import { decideEngine, type Engine } from '@/player/decide';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/store/auth';
import { loadPrefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

type PlaybackConfig = { url: string; engine: Engine };

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);

  const castClient = useRemoteMediaClient();
  const castState = useCastState();
  const [castPickerOpen, setCastPickerOpen] = useState(false);

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
    const decided = decideEngine(sources);
    const engine: Engine =
      prefs.preferredEngine === 'native'
        ? 'native'
        : prefs.preferredEngine === 'vlc'
          ? 'vlc'
          : decided;
    const url = Jellyfin.streamUrl(item.Id, state.auth.accessToken, deviceId);

    if (castClient) {
      try {
        await castClient.loadMedia({
          mediaInfo: {
            contentUrl: url,
            contentType: 'video/mp4',
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

    setPlayback({ url, engine });
  }

  if (!item) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  if (playback) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Player
          config={playback}
          itemId={item.Id}
          title={item.Name}
          resumeSeconds={Jellyfin.ticksToSeconds(item.UserData?.PlaybackPositionTicks ?? 0)}
          onExit={() => setPlayback(null)}
          onNativeError={() => setPlayback(p => (p ? { ...p, engine: 'vlc' } : p))}
        />
      </>
    );
  }

  const primary = item.ImageTags?.Primary;
  const backdrop = item.BackdropImageTags?.[0];
  const runtimeMin = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : null;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: '',
          headerTransparent: true,
          headerBackTitle: 'Back',
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {backdrop ? (
            <Image
              source={{ uri: Jellyfin.imageUrl(item.Id, backdrop, 'Backdrop', 1200) }}
              style={styles.backdrop}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View style={[styles.backdrop, { backgroundColor: colors.bgElevated }]} />
          )}
          <LinearGradient
            colors={[colors.scrimTop, colors.bg]}
            locations={[0, 1]}
            style={StyleSheet.absoluteFill}
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

          {item.Overview ? (
            <View style={styles.overviewCard}>
              <Text style={styles.sectionLabel}>Overview</Text>
              <Text style={styles.overview}>{item.Overview}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <CastPickerModal visible={castPickerOpen} onClose={() => setCastPickerOpen(false)} />
    </View>
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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

function Player({
  config,
  itemId,
  title,
  resumeSeconds,
  onExit,
  onNativeError,
}: {
  config: PlaybackConfig;
  itemId: string;
  title: string;
  resumeSeconds: number;
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
        <NativePlayer url={config.url} itemId={itemId} title={title} resumeSeconds={resumeSeconds} onError={onNativeError} onExit={onExit} />
      ) : (
        <>
          <VLCPlayer
            style={{ flex: 1 }}
            source={{ uri: config.url }}
            autoplay
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.exitBtn} onPress={onExit} activeOpacity={0.8}>
            <Text style={styles.exitBtnText}>Close</Text>
          </TouchableOpacity>
          <View style={styles.engineBadge}>
            <Text style={styles.engineBadgeText}>{config.engine.toUpperCase()}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function NativePlayer({ url, itemId, title, resumeSeconds, onError, onExit }: {
  url: string; itemId: string; title: string; resumeSeconds: number; onError: () => void; onExit: () => void;
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
  const [isLandscape, setIsLandscape] = useState(false);
  const [speed, setSpeed] = useState(1);

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
        Jellyfin.reportPlaybackProgress(itemId, Jellyfin.secondsToTicks(player.currentTime ?? 0), !isPlaying).catch(() => {});
      } catch {}
    });
    return () => sub.remove();
  }, [player, itemId]);

  // Report start on mount, stop on unmount.
  useEffect(() => {
    Jellyfin.reportPlaybackStart(itemId, Jellyfin.secondsToTicks(resumeSeconds)).catch(() => {});
    return () => {
      try {
        const pos = Jellyfin.secondsToTicks(player.currentTime ?? 0);
        Jellyfin.reportPlaybackStopped(itemId, pos).catch(() => {});
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
        ).catch(() => {});
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [player, itemId, playing]);

  useEffect(() => {
    const id = setInterval(() => {
      if (scrubbing) return;
      try {
        setPosition(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [player, scrubbing]);

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

  return (
    <>
      <Pressable style={{ flex: 1 }} onPress={() => setControlsVisible(v => !v)}>
        <VideoView
          player={player}
          style={{ flex: 1 }}
          fullscreenOptions={{ enable: true, autoExitOnRotate: false }}
          allowsPictureInPicture
          nativeControls={false}
          contentFit="contain"
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
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                <View style={styles.scrubberTrack}>
                  <View style={[styles.scrubberFill, { width: `${duration > 0 ? (position / duration) * 100 : 0}%` }]} />
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={(e) => {
                      const x = (e.nativeEvent as any).locationX ?? 0;
                      const w = (e.nativeEvent as any).layout?.width ?? 300;
                      const ratio = Math.max(0, Math.min(1, x / w));
                      seekTo(ratio * duration);
                    }}
                  />
                </View>
                <Text style={styles.timeText}>-{formatTime(Math.max(0, duration - position))}</Text>
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
      </Pressable>
      <TrackPickerModal
        visible={tracksOpen}
        player={player}
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
  onClose,
}: {
  visible: boolean;
  player: ReturnType<typeof useVideoPlayer>;
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

  function pickSub(track: any | null) {
    try {
      (player as any).subtitleTrack = track;
      setActiveSub(track);
    } catch {}
  }

  function pickAudio(track: any) {
    try {
      (player as any).audioTrack = track;
      setActiveAudio(track);
    } catch {}
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>Subtitles</Text>
          {subtitles.length === 0 ? (
            <Text style={styles.modalEmpty}>No subtitle tracks in this file</Text>
          ) : (
            <>
              <TrackRow label="Off" selected={!activeSub} onPress={() => pickSub(null)} />
              {subtitles.map((t, i) => (
                <TrackRow
                  key={`sub-${i}`}
                  label={t.label ?? t.language ?? `Track ${i + 1}`}
                  selected={activeSub && (activeSub.id === t.id || activeSub.label === t.label)}
                  onPress={() => pickSub(t)}
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

function SpeedPickerModal({
  visible, current, onClose, onPick,
}: {
  visible: boolean; current: number; onClose: () => void; onPick: (r: number) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  hero: { width: '100%', height: HERO_HEIGHT, overflow: 'hidden' },
  backdrop: { width: '100%', height: '100%' },
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
  overlayIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  scrubberTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  scrubberFill: { height: '100%', backgroundColor: colors.text },
});
