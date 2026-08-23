import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { colors, radius, spacing, type } from '@/theme';

/** Fast enough to feel live, slow enough not to hammer the server. */
const POLL_MS = 5000;

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [items, setItems] = useState<Jellyseerr.ActiveDownload[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await Jellyseerr.getActiveDownloads());
    } catch {
      // Keep whatever was on screen: a dropped poll should not blank the list
      // while a download is still perfectly fine on the server.
      setItems(prev => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (items === null) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={{ height: headerHeight }} />
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
        <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Animated.FlatList
        data={items}
        keyExtractor={(d: Jellyseerr.ActiveDownload, i: number) => d.downloadId ?? `${d.tmdbId}-${i}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} progressViewOffset={headerHeight} />
        }
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        ListHeaderComponent={<View style={{ height: headerHeight }} />}
        renderItem={({ item }: { item: Jellyseerr.ActiveDownload }) => <DownloadCard d={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 150 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <View style={styles.iconWrap}>
              <SymbolView
                name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }}
                tintColor={colors.textMuted}
                size={56}
              />
            </View>
            <Text style={styles.title}>{t('downloads.emptyTitle')}</Text>
            <Text style={styles.body}>{t('downloads.emptyBody')}</Text>
          </View>
        }
      />
      <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
    </View>
  );
}

function DownloadCard({ d }: { d: Jellyseerr.ActiveDownload }) {
  const size = d.size ?? 0;
  const left = d.sizeLeft ?? 0;
  const progress = size > 0 ? Math.max(0, Math.min(1, (size - left) / size)) : 0;
  const pct = Math.round(progress * 100);
  const poster = Jellyseerr.posterUrl(d.posterPath, 'w300');

  const episode = d.episode
    ? `S${String(d.episode.seasonNumber).padStart(2, '0')}E${String(d.episode.episodeNumber).padStart(2, '0')}`
    : null;

  return (
    <View style={styles.card}>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.poster, { backgroundColor: colors.surface }]} />
      )}
      <View style={styles.info}>
        <Text style={styles.cardTitle} numberOfLines={1}>{d.mediaTitle}</Text>
        {/* The release name is long and noisy, but it is the only thing that
            says which of several downloads for one title this row is. */}
        <Text style={styles.release} numberOfLines={1}>
          {episode ? `${episode} · ` : ''}{d.title ?? ''}
        </Text>

        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{pct}%</Text>
          <Text style={styles.meta}>
            {formatGB(size - left)} / {formatGB(size)}
          </Text>
          {d.timeLeft && d.timeLeft !== '00:00:00' ? (
            <Text style={styles.meta}>{d.timeLeft} left</Text>
          ) : d.status ? (
            <Text style={styles.meta}>{d.status}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatGB(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl * 2,
    paddingBottom: 150,
  },
  iconWrap: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  poster: { width: 56, height: 84, borderRadius: radius.sm, backgroundColor: colors.surface },
  info: { flex: 1, justifyContent: 'center', gap: spacing.xs },
  cardTitle: { ...type.bodyStrong, color: colors.text },
  release: { ...type.caption, color: colors.textDim },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.successBorder },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  meta: { ...type.caption, color: colors.textMuted },
});
