import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem, JellyfinView } from '@/types';
import type { JellyfinAuth } from '@/types';

type LibraryItem = { view: JellyfinView; items: JellyfinItem[] };

export default function LibraryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state } = useAuth();
  const [resume, setResume] = useState<JellyfinItem[]>([]);
  const [libs, setLibs] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (state.status !== 'signed-in') return;
    setLoading(true);
    try {
      const [views, resumeItems] = await Promise.all([
        Jellyfin.getViews(state.auth.userId),
        Jellyfin.getResumeItems(state.auth.userId, 12),
      ]);
      const filtered = views.filter(v => v.CollectionType === 'movies' || v.CollectionType === 'tvshows');
      const withItems = await Promise.all(
        filtered.map(async view => ({
          view,
          items: await Jellyfin.getItems(state.auth.userId, view.Id, 20),
        }))
      );
      setResume(resumeItems);
      setLibs(withItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [state.status]);

  if (state.status !== 'signed-in' || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  const heroItem = resume[0] ?? libs[0]?.items[0];

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <FlatList
        data={libs}
        keyExtractor={l => l.view.Id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
        ListHeaderComponent={
          <>
            {heroItem ? <HeroSpotlight item={heroItem} /> : null}
            {resume.length > 0 ? <ContinueWatchingRow items={resume} title={t('library.continueWatching')} /> : null}
          </>
        }
        renderItem={({ item }) => <LibraryRow lib={item} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      />
      <View style={styles.avatarFloating} pointerEvents="box-none">
        <AvatarButton auth={state.auth} onPress={() => router.push('/profile')} />
      </View>
    </View>
  );
}

function AvatarButton({ auth, onPress }: { auth: JellyfinAuth; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.avatarBtn}>
      {auth.primaryImageTag ? (
        <Image
          source={{ uri: Jellyfin.userImageUrl(auth.userId, auth.primaryImageTag, 96) }}
          style={styles.avatar}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitials}>{auth.userName?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function HeroSpotlight({ item }: { item: JellyfinItem }) {
  const router = useRouter();
  const { t } = useTranslation();
  const backdrop = item.BackdropImageTags?.[0];
  const primary = item.ImageTags?.Primary;
  const tag = backdrop ?? primary;
  const imageType: 'Backdrop' | 'Primary' = backdrop ? 'Backdrop' : 'Primary';

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push(`/item/${item.Id}`)}>
      <View style={styles.hero}>
        <Image
          source={{ uri: Jellyfin.imageUrl(item.Id, tag, imageType, 1200) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={[colors.scrimTop, colors.bg]}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroBody}>
          <Text style={styles.heroLabel}>{t('library.featured')}</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>{item.Name}</Text>
          <View style={styles.heroPillRow}>
            {item.ProductionYear ? (
              <View style={styles.heroPill}><Text style={styles.heroPillText}>{item.ProductionYear}</Text></View>
            ) : null}
            <View style={styles.heroPill}><Text style={styles.heroPillText}>{item.Type}</Text></View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ContinueWatchingRow({ items, title }: { items: JellyfinItem[]; title: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={i => i.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        renderItem={({ item }) => <ResumeCard item={item} />}
      />
    </View>
  );
}

function ResumeCard({ item }: { item: JellyfinItem }) {
  const backdrop = item.BackdropImageTags?.[0];
  const primary = item.ImageTags?.Primary;
  const tag = backdrop ?? primary;
  const imageType: 'Backdrop' | 'Primary' = backdrop ? 'Backdrop' : 'Primary';

  const progress =
    item.UserData?.PlaybackPositionTicks && item.RunTimeTicks
      ? Math.min(1, item.UserData.PlaybackPositionTicks / item.RunTimeTicks)
      : 0;

  const label =
    item.Type === 'Episode' && item.SeriesId && item.ParentIndexNumber != null && item.IndexNumber != null
      ? `S${item.ParentIndexNumber} · E${item.IndexNumber}`
      : item.ProductionYear
        ? String(item.ProductionYear)
        : '';

  return (
    <Link href={`/item/${item.Id}`} asChild>
      <TouchableOpacity style={styles.resumeCard} activeOpacity={0.8}>
        <View style={styles.resumeImageWrap}>
          <Image
            source={{ uri: Jellyfin.imageUrl(item.Id, tag, imageType, 500) }}
            style={styles.resumeImage}
            contentFit="cover"
            transition={200}
          />
          {progress > 0 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          ) : null}
        </View>
        <Text style={styles.resumeTitle} numberOfLines={1}>{item.Name}</Text>
        {label ? <Text style={styles.resumeMeta}>{label}</Text> : null}
      </TouchableOpacity>
    </Link>
  );
}

function LibraryRow({ lib }: { lib: LibraryItem }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{lib.view.Name}</Text>
        <Text style={styles.sectionCount}>{lib.items.length}</Text>
      </View>
      <FlatList
        horizontal
        data={lib.items}
        keyExtractor={i => i.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        renderItem={({ item }) => <PosterCard item={item} />}
      />
    </View>
  );
}

function PosterCard({ item }: { item: JellyfinItem }) {
  const tag = item.ImageTags?.Primary;
  return (
    <Link href={`/item/${item.Id}`} asChild>
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        <Image
          source={{ uri: Jellyfin.imageUrl(item.Id, tag) }}
          style={styles.poster}
          contentFit="cover"
          transition={200}
        />
        <Text style={styles.cardTitle} numberOfLines={1}>{item.Name}</Text>
        {item.ProductionYear ? <Text style={styles.cardYear}>{item.ProductionYear}</Text> : null}
      </TouchableOpacity>
    </Link>
  );
}

const HERO_HEIGHT = 360;
const RESUME_WIDTH = 200;
const RESUME_HEIGHT = 115;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  hero: { width: '100%', height: HERO_HEIGHT, backgroundColor: colors.bgElevated, overflow: 'hidden', marginBottom: spacing.xl },
  heroBody: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xl },
  heroLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  heroTitle: { ...type.display, color: colors.text, marginBottom: spacing.md },
  heroPillRow: { flexDirection: 'row', gap: spacing.sm },
  heroPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  heroPillText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  greetingSmall: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  greeting: { ...type.h1, color: colors.text },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassTint },
  avatarInitials: { color: colors.text, fontSize: 17, fontWeight: '700' },
  avatarFloating: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
  },

  section: { marginBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { ...type.h2, color: colors.text },
  sectionCount: { ...type.small, color: colors.textDim },

  resumeCard: { width: RESUME_WIDTH },
  resumeImageWrap: {
    width: RESUME_WIDTH,
    height: RESUME_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  resumeImage: { width: '100%', height: '100%' },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressFill: { height: '100%', backgroundColor: colors.text },
  resumeTitle: { marginTop: spacing.sm, ...type.small, color: colors.text },
  resumeMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  card: { width: 130 },
  poster: {
    width: 130,
    height: 195,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cardTitle: { marginTop: spacing.sm, ...type.small, color: colors.text },
  cardYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
