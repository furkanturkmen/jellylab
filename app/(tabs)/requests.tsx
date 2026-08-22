import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import * as Jellyseerr from '@/api/jellyseerr';
import { MEDIA_STATUS, REQUEST_STATUS, type JellyseerrRequest } from '@/types';
import { colors, radius, spacing, type as t } from '@/theme';

type EnrichedRequest = JellyseerrRequest & { details: Jellyseerr.MediaDetails | null };

export default function RequestsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await Jellyseerr.listRequests('all');
      const enriched = await Promise.all(
        raw.map(async r => ({
          ...r,
          details: await Jellyseerr.getMediaDetails(r.media.mediaType, r.media.tmdbId),
        }))
      );
      setItems(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && items.length === 0) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={r => String(r.id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
      renderItem={({ item }) => (
        <RequestCard r={item} onOpen={() => router.push(`/tmdb/${item.media.mediaType}/${item.media.tmdbId}`)} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>No requests yet</Text>
        </View>
      }
    />
  );
}

function RequestCard({ r, onOpen }: { r: EnrichedRequest; onOpen: () => void }) {
  const requestStatus = REQUEST_STATUS[r.status] ?? '?';
  const mediaStatus = MEDIA_STATUS[r.media.status] ?? '?';
  const available = r.media.status === 5;
  const title = r.details?.title ?? `TMDB ${r.media.tmdbId}`;
  const year = r.details?.year;
  const backdrop = Jellyseerr.backdropUrl(r.details?.backdropPath);
  const poster = Jellyseerr.posterUrl(r.details?.posterPath, 'w300');

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.85}>
      {backdrop ? (
        <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated }]} />
      )}
      <LinearGradient
        colors={['rgba(10,10,10,0.85)', 'rgba(10,10,10,0.55)', 'rgba(10,10,10,0.85)']}
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
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <View style={styles.pillRow}>
            <View style={[styles.pill, available && styles.pillAvailable]}>
              <Text style={styles.pillText}>{available ? 'Available' : requestStatus}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{mediaStatus}</Text>
            </View>
          </View>
          <Text style={styles.by}>
            {r.requestedBy.displayName} · {new Date(r.createdAt).toLocaleDateString()}
          </Text>
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
  title: { ...t.bodyStrong, color: colors.text },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  pillAvailable: { backgroundColor: 'rgba(52, 199, 89, 0.24)', borderColor: 'rgba(52, 199, 89, 0.5)' },
  pillText: { color: colors.text, ...t.caption, textTransform: 'uppercase' },
  by: { ...t.small, color: colors.textDim, marginTop: spacing.xs },
});
