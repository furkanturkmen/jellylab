import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View as RNView } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VLCPlayer } from 'react-native-vlc-media-player';

import { Text, View } from '@/components/Themed';
import * as Jellyfin from '@/api/jellyfin';
import { decideEngine, type Engine } from '@/player/decide';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceId } from '@/store/auth';
import type { JellyfinItem } from '@/types';

type PlaybackConfig = { url: string; engine: Engine };

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);

  useEffect(() => {
    if (state.status !== 'signed-in' || !id) return;
    Jellyfin.getItem(state.auth.userId, id).then(setItem);
  }, [state.status, id]);

  async function play() {
    if (state.status !== 'signed-in' || !item) return;
    const [deviceId, sources] = await Promise.all([
      getDeviceId(),
      Jellyfin.getPlaybackInfo(state.auth.userId, item.Id).catch(() => []),
    ]);
    const engine = decideEngine(sources);
    const url = Jellyfin.streamUrl(item.Id, state.auth.accessToken, deviceId);
    setPlayback({ url, engine });
  }

  if (!item) {
    return <View style={styles.center}><ActivityIndicator /></View>;
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

  return (
    <>
      <Stack.Screen options={{ title: item.Name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {backdrop ? (
          <Image source={{ uri: Jellyfin.imageUrl(item.Id, backdrop, 'Backdrop', 900) }} style={styles.backdrop} contentFit="cover" />
        ) : null}
        <View style={styles.body}>
          <View style={styles.headerRow}>
            {primary ? (
              <Image source={{ uri: Jellyfin.imageUrl(item.Id, primary, 'Primary', 300) }} style={styles.poster} contentFit="cover" />
            ) : null}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.title}>{item.Name}</Text>
              {item.ProductionYear ? <Text style={styles.meta}>{item.ProductionYear}</Text> : null}
              <TouchableOpacity style={styles.playBtn} onPress={play}>
                <Text style={styles.playBtnText}>Play</Text>
              </TouchableOpacity>
            </View>
          </View>
          {item.Overview ? <Text style={styles.overview}>{item.Overview}</Text> : null}
        </View>
      </ScrollView>
    </>
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
    <RNView style={styles.playerContainer}>
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
      <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
        <Text style={styles.exitBtnText}>Close</Text>
      </TouchableOpacity>
      <View style={styles.engineBadge}>
        <Text style={styles.engineBadgeText}>{config.engine.toUpperCase()}</Text>
      </View>
    </RNView>
  );
}

function NativePlayer({ url, onError }: { url: string; onError: () => void }) {
  const player = useVideoPlayer(url, p => {
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') {
        console.warn('expo-video failed, falling back to VLC', error);
        onError();
      }
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { width: '100%', height: 200 },
  body: { padding: 16 },
  headerRow: { flexDirection: 'row' },
  poster: { width: 100, height: 150, borderRadius: 6, backgroundColor: '#222' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  playBtn: { marginTop: 12, paddingVertical: 10, backgroundColor: '#4a7cff', borderRadius: 8, alignItems: 'center' },
  playBtnText: { color: '#fff', fontWeight: '600' },
  overview: { marginTop: 16, lineHeight: 20 },
  playerContainer: { flex: 1, backgroundColor: '#000' },
  exitBtn: { position: 'absolute', top: 40, right: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6 },
  exitBtnText: { color: '#fff' },
  engineBadge: { position: 'absolute', top: 40, left: 20, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4 },
  engineBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
});
