import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { type JellyseerrRequest } from '@/types';
import { colors, radius, spacing, type as t } from '@/theme';

type EnrichedRequest = JellyseerrRequest & { details: Jellyseerr.MediaDetails | null };

export default function RequestsScreen() {
  const router = useRouter();
  const { t: tr } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [items, setItems] = useState<EnrichedRequest[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * `silent` keeps the poll invisible. loading drives the RefreshControl, so
   * without it every 5-second tick flashed the pull-to-refresh spinner - which
   * looks like the list is reloading when only a percentage moved.
   */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Refresh while anything is actually in the download queue, so the bars move
   * rather than showing whatever was true when the tab opened. Gated on there
   * being something to watch: with nothing downloading this costs nothing, and
   * it stops on its own once the last one finishes.
   */
  const anyDownloading = items.some(r => (r.media.downloadStatus ?? []).length > 0);
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
          <RequestCard r={item} onOpen={() => router.push(`/tmdb/${item.media.mediaType}/${item.media.tmdbId}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 150 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{tr('requests.empty')}</Text>
          </View>
        }
      />
      <TabHeader title={tr('tabs.requests')} scrollY={scrollY} />
    </View>
  );
}

function RequestCard({ r, onOpen }: { r: EnrichedRequest; onOpen: () => void }) {
  const { t } = useTranslation();
  const requestStatus = t(`requests.status.${r.status}`, { defaultValue: '?' });
  const mediaStatus = t(`requests.mediaStatus.${r.media.status}`, { defaultValue: '?' });
  const available = r.media.status === 5;
  // Deduplicated and order-preserving: request state first, media state second,
  // and nothing shown twice when they agree.
  const pills = [...new Set([available ? mediaStatus : requestStatus, mediaStatus])];

  // Seerr carries the Sonarr/Radarr queue on each request, and those read their
  // figures straight from qBittorrent - so this is the same percentage the
  // torrent client shows, without the app needing to talk to it.
  const queue = r.media.downloadStatus ?? [];
  const totals = queue.reduce<{ size: number; left: number }>(
    (acc, d) => ({ size: acc.size + (d.size ?? 0), left: acc.left + (d.sizeLeft ?? 0) }),
    { size: 0, left: 0 }
  );
  const pct = totals.size > 0 ? Math.round(((totals.size - totals.left) / totals.size) * 100) : null;
  // one entry has a real ETA; a season pack split over many does not
  const timeLeft = queue.length === 1 ? queue[0].timeLeft : undefined;
  // Seerr files one request per season selection, so a series can appear
  // several times. Without showing which seasons each covers the rows look
  // like duplicates of each other.
  const seasonNumbers = (r.seasons ?? []).map(x => x.seasonNumber).sort((a, b) => a - b);

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
              Once something is available both said "Available", which is one
              badge doing the work of two — so identical labels collapse. */}
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
                {pct}%{timeLeft && timeLeft !== '00:00:00' ? ` · ${timeLeft}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.by}>
              {r.requestedBy.displayName} · {new Date(r.createdAt).toLocaleDateString()}
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
  by: { ...t.small, color: colors.textDim, marginTop: spacing.xs },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  barTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.successBorder },
  progressText: { ...t.caption, color: colors.textMuted, minWidth: 34, textAlign: 'right' },
});
