import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SymbolView } from 'expo-symbols';

import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { useDownloads } from '@/hooks/useDownloads';
import { enqueueDownload } from '@/store/downloads';
import { formatBytes } from '@/lib/bytes';
import { formatDate } from '@/lib/date';
import { metadataLanguage, oneLine } from '@/lib/text';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The season picker and episode list on a series page.
 *
 * Out of the item screen, which was holding this alongside both player engines
 * and the pickers. It reaches back into none of it - a series id, a user id
 * and the seasons to offer - which is what made it safe to move.
 */

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

export function SeriesEpisodes({ seriesId, userId, tmdbId, seasons }: {
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

const styles = StyleSheet.create({
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
  epRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  epThumbWrap: { width: 120, height: 68, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  epThumb: { width: '100%', height: '100%' },
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
  epProgressTrack: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  epProgressFill: { height: '100%', backgroundColor: colors.text },
  epTitle: { ...type.bodyStrong, color: colors.text },
  epMeta: { ...type.caption, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase' },
  epOverview: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },
});
