import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';

import * as Jellyseerr from '@/api/jellyseerr';
import { colors, radius, spacing, type } from '@/theme';
import { MEDIA_STATUS } from '@/types';

type MediaType = 'movie' | 'tv';

export default function TmdbDetailScreen() {
  const { type, id } = useLocalSearchParams<{ type: MediaType; id: string }>();
  const tmdbId = Number(id);
  const [details, setDetails] = useState<Jellyseerr.TmdbFullDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!type || !tmdbId) return;
    Jellyseerr.getTmdbDetails(type, tmdbId).then(d => {
      setDetails(d);
      setLoading(false);
    });
  }, [type, tmdbId]);

  async function onRequest() {
    if (!details) return;
    setRequesting(true);
    try {
      await Jellyseerr.createRequest(type, details.id, type === 'tv' ? 'all' : undefined);
      Alert.alert('Requested', `${details.title} sent to Jellyseerr`);
      // Refetch to update badge state
      const refreshed = await Jellyseerr.getTmdbDetails(type, tmdbId);
      setDetails(refreshed);
    } catch (e: any) {
      Alert.alert('Request failed', e?.response?.data?.message ?? e?.message ?? 'Unknown error');
    } finally {
      setRequesting(false);
    }
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

  const available = details.mediaInfo?.status === 5;
  const partiallyAvailable = details.mediaInfo?.status === 4;
  const requested = (details.mediaInfo?.requests?.length ?? 0) > 0;

  const buttonLabel = requesting
    ? 'Requesting…'
    : available
      ? 'Available on Jellyfin'
      : partiallyAvailable
        ? 'Partially Available'
        : requested
          ? 'Requested'
          : 'Request';

  const buttonDisabled = requesting || available || partiallyAvailable || requested;

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

          <TouchableOpacity
            style={[styles.requestBtn, buttonDisabled && styles.requestBtnDisabled]}
            onPress={onRequest}
            disabled={buttonDisabled}
            activeOpacity={0.85}
          >
            <Text style={[styles.requestBtnText, buttonDisabled && styles.requestBtnTextDisabled]}>
              {buttonLabel}
            </Text>
          </TouchableOpacity>

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
            {details.mediaInfo?.status ? (
              <MetaRow k="On Jellyfin" v={MEDIA_STATUS[details.mediaInfo.status] ?? '—'} />
            ) : (
              <MetaRow k="On Jellyfin" v="Not requested" />
            )}
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

  requestBtn: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnDisabled: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  requestBtnText: { color: colors.accentContrast, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  requestBtnTextDisabled: { color: colors.textMuted },

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

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  metaKey: { ...type.small, color: colors.textMuted },
  metaVal: { ...type.small, color: colors.text, flex: 1, textAlign: 'right', marginLeft: spacing.md },

  castCard: { width: 90 },
  castImg: { width: 90, height: 90, borderRadius: radius.pill, backgroundColor: colors.surface },
  castName: { ...type.small, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  castRole: { ...type.caption, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
