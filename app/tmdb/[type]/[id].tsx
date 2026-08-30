import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import { GlassButton, PrimaryButton } from '@/components/AppleButton';
import { QualityPicker } from '@/components/QualityPicker';
import { formatDate } from '@/lib/date';
import { kindKey, tmdbKind } from '@/lib/kind';
import { plainText } from '@/lib/text';
import { openSeasonSheet } from '@/store/sheet';
import { colors, radius, spacing, type } from '@/theme';
import { MEDIA_STATUS } from '@/types';

type MediaType = 'movie' | 'tv';

/** Flat darkening over the backdrop, same dial as the library hero. */
const HERO_SHADE = 0.3;

export default function TmdbDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const scrollY = useRef(new Animated.Value(0)).current;

  /**
   * The hero drifts and fades as the page moves, the same way the library and
   * item heroes do.
   *
   * Scrolling it away at the speed of the text dragged the dark shade across
   * the screen with it - a moving band rather than something that belonged to
   * the artwork. A third of the speed, and gone by the time the content has
   * covered where it was.
   */
  // Pull down and the artwork grows rather than leaving a gap; scroll up and it
  // drifts at a third of the speed and fades out. The same hero as the show
  // page - this screen only scrolled it away before.
  const heroRubberBand = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0],
    outputRange: [-HERO_HEIGHT / 2, 0],
    extrapolateLeft: 'extend' as const,
    extrapolateRight: 'clamp' as const,
  });
  const heroDrift = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, HERO_HEIGHT / 3],
    extrapolate: 'clamp' as const,
  });

  const heroFade = {
    opacity: scrollY.interpolate({
      inputRange: [0, HERO_HEIGHT * 0.55, HERO_HEIGHT * 0.9],
      outputRange: [1, 1, 0],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      { translateY: Animated.add(heroRubberBand, heroDrift) },
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
  const { type, id } = useLocalSearchParams<{ type: MediaType; id: string }>();
  const tmdbId = Number(id);
  const [details, setDetails] = useState<Jellyseerr.TmdbFullDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  /**
   * The quality profiles this account may choose between, and the choice.
   *
   * A title is one object in Radarr or Sonarr with exactly one profile, so
   * this picks what that object seeks - never a second copy. Empty when the
   * account lacks Seerr's advanced-request permission, which is why the
   * picker renders nothing rather than erroring.
   *
   * undefined means "the server default", sent as no profile id at all, so a
   * request keeps working if that default is later changed.
   */
  const [profiles, setProfiles] = useState<Jellyseerr.QualityProfile[]>([]);
  const [profileId, setProfileId] = useState<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    const d = await Jellyseerr.getTmdbDetails(type, tmdbId);
    setDetails(d);
    setLoading(false);
  }, [type, tmdbId]);

  // Asked for once, and never allowed to break the screen: this is a control
  // that may legitimately not appear.
  useEffect(() => {
    let alive = true;
    Jellyseerr.qualityProfiles(type)
      .then(p => { if (alive) setProfiles(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [type]);

  useEffect(() => {
    if (!type || !tmdbId) return;
    refresh();
  }, [type, tmdbId, refresh]);

  /**
   * Poll while the server is working on this, so the download bars move instead
   * of showing whatever was true when the screen opened.
   *
   * Gated on the status rather than on `details`, otherwise every refresh would
   * rebuild the interval and reset its own timer. Skipped while the app is
   * backgrounded — a progress bar nobody is looking at is not worth the radio.
   */
  const isProcessing = details?.mediaInfo?.status === Jellyseerr.SEERR_STATUS.PROCESSING;
  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [isProcessing, refresh]);

  /**
   * Movies go straight through. TV opens a picker instead of sending
   * seasons: 'all' — once any season is available, "all" includes it, and Seerr
   * rejects the whole request rather than taking the remainder. That made
   * anything partly downloaded impossible to top up.
   */
  async function onRequest() {
    if (!details) return;

    if (type !== 'tv') {
      setActing(true);
      try {
        await Jellyseerr.createRequest(type, details.id, undefined, profileId);
        await refresh();
      } catch (e: any) {
        Alert.alert(t('request.submitFailed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
      } finally {
        setActing(false);
      }
      return;
    }

    setActing(true);
    try {
      const all = await Jellyseerr.getTvSeasons(details.id);
      const requestable = all.filter(Jellyseerr.isSeasonRequestable);
      if (requestable.length === 0) {
        Alert.alert(t('request.nothingTitle'), t('request.nothingBody'));
        return;
      }
      // The sheet is a route: it is handed the list and the callback through
      // the store, then pushed.
      openSeasonSheet({
        seasons: all,
        initial: requestable.map(s => s.seasonNumber),
        onConfirm: submitSeasons,
      });
      router.push('/sheet/seasons');
    } catch (e: any) {
      Alert.alert(t('request.loadSeasonsFailed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setActing(false);
    }
  }

  async function submitSeasons(seasons: number[]) {
    if (!details || seasons.length === 0) return;
    setActing(true);
    try {
      await Jellyseerr.createRequest('tv', details.id, seasons, profileId);
      await refresh();
    } catch (e: any) {
      Alert.alert(t('request.submitFailed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setActing(false);
    }
  }

  async function onDeleteRequest() {
    if (!details?.mediaInfo?.requests?.length) return;
    const reqId = details.mediaInfo.requests[0].id;
    Alert.alert(t('request.deleteTitle'), t('request.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          try {
            await Jellyseerr.deleteRequest(reqId);
            await refresh();
          } catch (e: any) {
            Alert.alert(t('request.deleteFailed'), e?.response?.data?.message ?? e?.message ?? t('common.notPermitted'));
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
      t('request.removeTitle'),
      t('request.removeBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
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
              Alert.alert(t('request.removeFailed'), e?.response?.data?.message ?? e?.message ?? t('common.notPermitted'));
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
        <Stack.Screen options={{ title: '', headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' }, headerTintColor: colors.text }} />
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (!details) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '', headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' }, headerTintColor: colors.text }} />
        <Text style={styles.errorText}>{t('request.failed')}</Text>
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

  /**
   * Why an approved request has nothing downloading. Radarr with the default
   * "Released" minimum availability will not search until a film is out
   * digitally, so a cinema-only release sits approved and idle for months —
   * which reads as a failure unless it says otherwise.
   */
  const waitingReason = (() => {
    if (!processing || activeDownloads.length > 0) return null;
    const digital = type === 'movie' ? Jellyseerr.digitalReleaseDate(details) : null;
    if (digital && digital.getTime() > Date.now()) {
      return t('request.waitingCinema', { date: formatDate(digital) });
    }
    return t('request.waitingMatch');
  })();

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: '', headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' }, headerTintColor: colors.text }} />
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        <View style={styles.hero}>
          {/* Everything that darkens the artwork travels with it, or the shade
              slides off the picture on a pull - which is what left a hard line
              across the item screen until it was fixed there. */}
          <Animated.View style={[styles.heroInner, heroFade]}>
          {backdrop ? (
            <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated }]} />
          )}
          {/* Same treatment as the other heroes: flat shade for legibility,
              near-black under the status bar for the Dynamic Island. */}
          <View style={styles.heroShade} />
          <LinearGradient
            colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.45)', 'transparent']}
            locations={[0, 0.55, 1]}
            style={[StyleSheet.absoluteFill, { height: 130, bottom: undefined }]}
          />
          <LinearGradient
            colors={[colors.scrimTop, colors.bg]}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          </Animated.View>
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
                <Pill>{t(kindKey(tmdbKind({ mediaType: type, genreIds: details.genres?.map(g => g.id), originalLanguage: details.originalLanguage })))}</Pill>
              </View>
            </View>
          </View>

          {/* Above the button, because it changes what the button will do.
              Hidden once a title is fully available: there is nothing left to
              ask for, and changing the profile then is an upgrade decision
              that belongs in Radarr rather than behind a request button. */}
          {!available ? (
            <QualityPicker
              profiles={profiles}
              selected={profileId}
              onSelect={setProfileId}
            />
          ) : null}

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

          {/* A series can always gain seasons — one already downloading, one
              partly there, even one Seerr calls complete until the next season
              airs. So this stays available whenever the primary button is doing
              something else. The picker itself reports when there is nothing
              left to ask for, rather than this having to predict it. */}
          {type === 'tv' && (available || partiallyAvailable || processing || requested) ? (
            <GlassButton
              label={acting ? t('action.checkingSeasons') : t('action.requestMoreSeasons')}
              icon={{ ios: 'plus', android: 'add', web: 'add' }}
              onPress={onRequest}
              disabled={acting}
              style={styles.secondaryAction}
            />
          ) : null}

          {processing && activeDownloads.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t('request.downloading')}</Text>
              {activeDownloads.map((d, i) => (
                <DownloadRow key={`${d.downloadId ?? 'dl'}-${i}`} d={d} />
              ))}
            </View>
          ) : waitingReason ? (
            /* Approved with nothing downloading looks identical to broken.
               Say why rather than showing an empty card. */
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t('request.notDownloading')}</Text>
              <Text style={styles.waitingText}>{waitingReason}</Text>
            </View>
          ) : null}

          {(requested || available || partiallyAvailable) ? (
            <View style={styles.adminRow}>
              {requested ? (
                <TouchableOpacity style={styles.adminBtn} onPress={onDeleteRequest} disabled={acting} activeOpacity={0.85}>
                  <Text style={styles.adminBtnText}>{t('request.deleteRequest')}</Text>
                </TouchableOpacity>
              ) : null}
              {(available || partiallyAvailable) && details.mediaInfo?.id ? (
                <TouchableOpacity style={styles.adminBtn} onPress={onRemoveFromJellyfin} disabled={acting} activeOpacity={0.85}>
                  <Text style={styles.adminBtnText}>{t('request.removeFromJellyfin')}</Text>
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
              <Text style={styles.sectionLabel}>{t('detail.overview')}</Text>
              <Text style={styles.overview}>{plainText(details.overview)}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t('detail.details')}</Text>
            {details.status ? <MetaRow k={t('request.status')} v={t(`tmdbStatus.${details.status}`, { defaultValue: details.status })} /> : null}
            <MetaRow
              k={t('request.onJellyfin')}
              v={mediaStatus ? t(`mediaStatus.${mediaStatus}`, { defaultValue: MEDIA_STATUS[mediaStatus] ?? '—' }) : t('request.notRequested')}
            />
            {details.releaseDate ? <MetaRow k={t('request.released')} v={formatDate(details.releaseDate)} /> : null}
            {details.originalLanguage ? <MetaRow k={t('request.language')} v={details.originalLanguage.toUpperCase()} /> : null}
            {details.numberOfSeasons != null ? <MetaRow k={t('request.seasonCount')} v={String(details.numberOfSeasons)} /> : null}
            {details.numberOfEpisodes != null ? <MetaRow k={t('request.episodeCount')} v={String(details.numberOfEpisodes)} /> : null}
            {details.productionCountries && details.productionCountries.length > 0 ? (
              <MetaRow k={t('request.countries')} v={details.productionCountries.map(c => c.name).join(', ')} />
            ) : null}
          </View>

          {details.credits?.cast && details.credits.cast.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t('detail.cast')}</Text>
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
      </Animated.ScrollView>

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
  const { t } = useTranslation();
  // Every branch renders the same button, so only the label, the glyph and
  // whether it does anything actually differ. Deciding those up front keeps
  // six near-identical blocks of JSX from drifting apart.
  const play = (label: string) => (
    <PrimaryButton
      label={label}
      icon={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
      onPress={onPlay}
      style={styles.primaryAction}
    />
  );
  // A state, not an action: disabled carries that to VoiceOver as well as to
  // the eye, which a plain styled View never did.
  const state = (label: string) => (
    <PrimaryButton label={label} onPress={() => {}} disabled style={styles.primaryAction} />
  );

  if (available) return hasJellyfinId ? play(t('action.playOnJellyfin')) : state(t('action.availableOnJellyfin'));
  if (processing) return state(t('action.processing'));
  // Partially available means some seasons are there and some are not, which
  // is exactly when you want to ask for the rest. It used to render a disabled
  // "Partially Available" label, so a series like this could never be topped
  // up. Play what exists; the Request seasons button below covers the gap.
  if (partiallyAvailable) return hasJellyfinId ? play(t('action.playAvailable')) : state(t('action.partiallyAvailable'));
  if (requested) return state(t('action.requested'));
  return (
    <PrimaryButton
      label={acting ? t('action.requesting') : t('action.request')}
      icon={acting ? undefined : { ios: 'plus', android: 'add', web: 'add' }}
      onPress={onRequest}
      disabled={acting}
      style={styles.primaryAction}
    />
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
/** Extra height above the visible hero for the rubber-band to grow into. */
const HERO_BLEED = 320;
/** A few percent of over-scale, so rounding never shows a hairline of background. */
const HERO_STRETCH_SLOP = 1.08;
const POSTER_OFFSET = -80;

const styles = StyleSheet.create({
  heroShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${HERO_SHADE})` },
  secondaryAction: { marginTop: spacing.md },
  waitingText: { ...type.body, color: colors.textMuted, lineHeight: 20 },
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  errorText: { ...type.body, color: colors.textDim },

  hero: { width: '100%', height: HERO_HEIGHT + HERO_BLEED, marginTop: -HERO_BLEED, overflow: 'hidden' },
  // Sits below the bleed at rest; the stretch grows it into that space.
  heroInner: { position: 'absolute', top: HERO_BLEED, left: 0, right: 0, bottom: 0 },
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

  primaryAction: { marginTop: spacing.xl },

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
