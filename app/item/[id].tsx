import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VLCPlayer } from 'react-native-vlc-media-player';
import GoogleCast, { useCastState, useRemoteMediaClient } from 'react-native-google-cast';
import { SymbolView } from 'expo-symbols';

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

  useEffect(() => {
    // Kick discovery even if autostart didn't fire. Safe to call repeatedly.
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
    const engine = prefs.preferVLC ? 'vlc' : decided;
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
      <Player
        config={playback}
        onExit={() => setPlayback(null)}
        onNativeError={() => setPlayback(p => (p ? { ...p, engine: 'vlc' } : p))}
      />
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
              onPress={async () => {
                try {
                  await GoogleCast.getDiscoveryManager().startDiscovery();
                  await GoogleCast.showCastDialog();
                } catch {}
              }}
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
    </View>
  );
}

function Player({
  config,
  onExit,
  onNativeError,
}: {
  config: PlaybackConfig;
  onExit: () => void;
  onNativeError: () => void;
}) {
  return (
    <View style={styles.playerContainer}>
      {config.engine === 'native' ? (
        <NativePlayer url={config.url} onError={onNativeError} />
      ) : (
        <VLCPlayer
          style={{ flex: 1 }}
          source={{ uri: config.url }}
          autoplay
          resizeMode="contain"
        />
      )}
      <TouchableOpacity style={styles.exitBtn} onPress={onExit} activeOpacity={0.8}>
        <Text style={styles.exitBtnText}>Close</Text>
      </TouchableOpacity>
      <View style={styles.engineBadge}>
        <Text style={styles.engineBadgeText}>{config.engine.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function NativePlayer({ url, onError }: { url: string; onError: () => void }) {
  const player = useVideoPlayer(url, p => {
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => sub.remove();
  }, [player, onError]);

  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      fullscreenOptions={{ enable: true, autoExitOnRotate: false }}
      allowsPictureInPicture
      nativeControls
    />
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
});
