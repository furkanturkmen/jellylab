import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import * as Jellyseerr from '@/api/jellyseerr';
import { colors, radius, spacing, type } from '@/theme';
import { MEDIA_STATUS } from '@/types';

type MediaType = 'movie' | 'tv';

export default function TmdbDetailScreen() {
  const router = useRouter();
  const { type, id } = useLocalSearchParams<{ type: MediaType; id: string }>();
  const tmdbId = Number(id);
  const [details, setDetails] = useState<Jellyseerr.TmdbFullDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    const d = await Jellyseerr.getTmdbDetails(type, tmdbId);
    setDetails(d);
    setLoading(false);
  }, [type, tmdbId]);

  useEffect(() => {
    if (!type || !tmdbId) return;
    refresh();
  }, [type, tmdbId, refresh]);

  async function onRequest() {
    if (!details) return;
    setActing(true);
    try {
      await Jellyseerr.createRequest(type, details.id, type === 'tv' ? 'all' : undefined);
      await refresh();
    } catch (e: any) {
      Alert.alert('Request failed', e?.response?.data?.message ?? e?.message ?? 'Unknown error');
    } finally {
      setActing(false);
    }
  }

  async function onDeleteRequest() {
    if (!details?.mediaInfo?.requests?.length) return;
    const reqId = details.mediaInfo.requests[0].id;
    Alert.alert('Delete request?', 'The request will be cancelled but any downloaded files stay on Jellyfin.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          try {
            await Jellyseerr.deleteRequest(reqId);
            await refresh();
          } catch (e: any) {
            Alert.alert('Delete failed', e?.response?.data?.message ?? e?.message ?? 'Not permitted');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  }

  async function onRemoveFromJellyfin() {
    if (!details?.mediaInfo?.id) return;
    const mediaId = details.mediaInfo.id;
    Alert.alert(
      'Remove from Jellyfin?',
      'This removes the media from Jellyseerr and asks Radarr/Sonarr to remove the file. Irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActing(true);
            try {
              try {
                await Jellyseerr.removeMediaFile(mediaId);
              } catch {}
              await Jellyseerr.deleteMedia(mediaId);
              await refresh();
            } catch (e: any) {
              Alert.alert('Remove failed', e?.response?.data?.message ?? e?.message ?? 'Not permitted');
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  }

  function onPlayInJellyfin() {
    if (!details?.mediaInfo?.jellyfinMediaId) return;
    router.push(`/item/${details.mediaInfo.jellyfinMediaId}`);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '', headerTransparent: true, headerTintColor: colors.text }} />
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!details) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '', headerTransparent: true, headerTintColor: colors.text }} />
        <Text style={styles.errorText}>Failed to load details</Text>
      </View>
    );
  }

  const year = details.releaseDate?.slice(0, 4);
  const backdrop = details.backdropPath ? `https://image.tmdb.org/t/p/w1280${details.backdropPath}` : null;
  const poster = details.posterPath ? `https://image.tmdb.org/t/p/w500${details.posterPath}` : null;
  const rating = details.voteAverage ? Math.round(details.voteAverage * 10) : null;

  const mediaStatus = details.mediaInfo?.status;
  const available = mediaStatus === 5;
  const partiallyAvailable = mediaStatus === 4;
  const processing = mediaStatus === 3;
  const requested = (details.mediaInfo?.requests?.length ?? 0) > 0;
  const jellyfinId = details.mediaInfo?.jellyfinMediaId;
  const activeDownloads = details.mediaInfo?.downloadStatus ?? [];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: '', headerTransparent: true, headerBackTitle: 'Back', headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {backdrop ? (
            <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated }]} />
          )}
          <LinearGradient
            colors={[colors.scrimTop, colors.bg]}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.headerRow}>
            {poster ? (
              <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.poster, { backgroundColor: colors.surface }]} />
            )}
            <View style={styles.metaCol}>
              <Text style={styles.title}>{details.title}</Text>
              {details.tagline ? <Text style={styles.tagline}>{details.tagline}</Text> : null}
              <View style={styles.pillRow}>
                {year ? <Pill>{year}</Pill> : null}
                {details.runtime ? <Pill>{details.runtime}m</Pill> : null}
                {rating != null ? <Pill>{rating}%</Pill> : null}
                <Pill>{type === 'movie' ? 'Movie' : 'TV'}</Pill>
              </View>
            </View>
          </View>

          <PrimaryAction
            available={available}
            partiallyAvailable={partiallyAvailable}
            processing={processing}
            requested={requested}
            acting={acting}
            hasJellyfinId={!!jellyfinId}
            onPlay={onPlayInJellyfin}
            onRequest={onRequest}
          />

          {processing && activeDownloads.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Downloading</Text>
              {activeDownloads.map((d, i) => (
                <DownloadRow key={`${d.downloadId ?? 'dl'}-${i}`} d={d} />
              ))}
            </View>
          ) : null}

          {(requested || available || partiallyAvailable) ? (
            <View style={styles.adminRow}>
              {requested ? (
                <TouchableOpacity style={styles.adminBtn} onPress={onDeleteRequest} disabled={acting} activeOpacity={0.85}>
                  <Text style={styles.adminBtnText}>Delete Request</Text>
                </TouchableOpacity>
              ) : null}
              {(available || partiallyAvailable) && details.mediaInfo?.id ? (
                <TouchableOpacity style={styles.adminBtn} onPress={onRemoveFromJellyfin} disabled={acting} activeOpacity={0.85}>
                  <Text style={styles.adminBtnText}>Remove from Jellyfin</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {details.genres && details.genres.length > 0 ? (
            <View style={styles.genreRow}>
              {details.genres.map(g => (
                <Pill key={g.id}>{g.name}</Pill>
              ))}
            </View>
          ) : null}

          {details.overview ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Overview</Text>
              <Text style={styles.overview}>{details.overview}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Details</Text>
            {details.status ? <MetaRow k="Status" v={details.status} /> : null}
            <MetaRow k="On Jellyfin" v={mediaStatus ? (MEDIA_STATUS[mediaStatus] ?? '—') : 'Not requested'} />
            {details.releaseDate ? <MetaRow k="Released" v={details.releaseDate} /> : null}
            {details.originalLanguage ? <MetaRow k="Language" v={details.originalLanguage.toUpperCase()} /> : null}
            {details.numberOfSeasons != null ? <MetaRow k="Seasons" v={String(details.numberOfSeasons)} /> : null}
            {details.numberOfEpisodes != null ? <MetaRow k="Episodes" v={String(details.numberOfEpisodes)} /> : null}
            {details.productionCountries && details.productionCountries.length > 0 ? (
              <MetaRow k="Countries" v={details.productionCountries.map(c => c.name).join(', ')} />
            ) : null}
          </View>

          {details.credits?.cast && details.credits.cast.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Cast</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.md }}>
                {details.credits.cast.slice(0, 15).map(person => (
                  <View key={person.id} style={styles.castCard}>
                    {person.profilePath ? (
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w185${person.profilePath}` }}
                        style={styles.castImg}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={[styles.castImg, { backgroundColor: colors.surface }]} />
                    )}
                    <Text style={styles.castName} numberOfLines={2}>{person.name}</Text>
                    <Text style={styles.castRole} numberOfLines={2}>{person.character}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function PrimaryAction({
  available, partiallyAvailable, processing, requested, acting, hasJellyfinId, onPlay, onRequest,
}: {
  available: boolean;
  partiallyAvailable: boolean;
  processing: boolean;
  requested: boolean;
  acting: boolean;
  hasJellyfinId: boolean;
  onPlay: () => void;
  onRequest: () => void;
}) {
  if (available && hasJellyfinId) {
    return (
      <TouchableOpacity style={styles.primaryBtn} onPress={onPlay} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>▶  Play on Jellyfin</Text>
      </TouchableOpacity>
    );
  }
  if (available) {
    return (
      <View style={[styles.primaryBtn, styles.primaryBtnDisabled]}>
        <Text style={[styles.primaryBtnText, styles.primaryBtnTextDisabled]}>Available on Jellyfin</Text>
      </View>
    );
  }
  if (processing) {
    return (
      <View style={[styles.primaryBtn, styles.primaryBtnDisabled]}>
        <Text style={[styles.primaryBtnText, styles.primaryBtnTextDisabled]}>Processing…</Text>
      </View>
    );
  }
  if (partiallyAvailable) {
    return (
      <View style={[styles.primaryBtn, styles.primaryBtnDisabled]}>
        <Text style={[styles.primaryBtnText, styles.primaryBtnTextDisabled]}>Partially Available</Text>
      </View>
    );
  }
  if (requested) {
    return (
      <View style={[styles.primaryBtn, styles.primaryBtnDisabled]}>
        <Text style={[styles.primaryBtnText, styles.primaryBtnTextDisabled]}>Requested</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, acting && styles.primaryBtnDisabled]}
      onPress={onRequest}
      disabled={acting}
      activeOpacity={0.85}
    >
      <Text style={[styles.primaryBtnText, acting && styles.primaryBtnTextDisabled]}>
        {acting ? 'Requesting…' : 'Request'}
      </Text>
    </TouchableOpacity>
  );
}

function DownloadRow({ d }: { d: Jellyseerr.DownloadStatus }) {
  const size = d.size ?? 0;
  const left = d.sizeLeft ?? 0;
  const progress = size > 0 ? Math.max(0, Math.min(1, (size - left) / size)) : 0;
  const pct = Math.round(progress * 100);
  const label =
    d.episode
      ? `S${d.episode.seasonNumber} · E${d.episode.episodeNumber}`
      : d.title ?? 'Downloading';

  return (
    <View style={styles.downloadRow}>
      <View style={styles.downloadHeader}>
        <Text style={styles.downloadLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.downloadPct}>{pct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      {d.timeLeft ? <Text style={styles.downloadEta}>{d.timeLeft} left</Text> : null}
    </View>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaKey}>{k}</Text>
      <Text style={styles.metaVal}>{v}</Text>
    </View>
  );
}

const HERO_HEIGHT = 320;
const POSTER_OFFSET = -80;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  errorText: { ...type.body, color: colors.textDim },

  hero: { width: '100%', height: HERO_HEIGHT, overflow: 'hidden' },
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
  title: { ...type.h1, color: colors.text, marginBottom: spacing.xs },
  tagline: { ...type.small, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.md },

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

  primaryBtn: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  primaryBtnText: { color: colors.accentContrast, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  primaryBtnTextDisabled: { color: colors.textMuted },

  adminRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  adminBtn: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 69, 58, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBtnText: { color: 'rgba(255, 99, 99, 1)', ...type.small, fontWeight: '600' },

  genreRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.lg },

  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  overview: { ...type.body, color: colors.text, lineHeight: 22 },

  downloadRow: { marginTop: spacing.md, gap: spacing.xs },
  downloadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  downloadLabel: { ...type.small, color: colors.text, flex: 1, marginRight: spacing.sm },
  downloadPct: { ...type.small, color: colors.text, fontWeight: '600' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.text },
  downloadEta: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  metaKey: { ...type.small, color: colors.textMuted },
  metaVal: { ...type.small, color: colors.text, flex: 1, textAlign: 'right', marginLeft: spacing.md },

  castCard: { width: 90 },
  castImg: { width: 90, height: 90, borderRadius: radius.pill, backgroundColor: colors.surface },
  castName: { ...type.small, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  castRole: { ...type.caption, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
