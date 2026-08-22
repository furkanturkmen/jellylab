import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';

import * as Jellyseerr from '@/api/jellyseerr';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyseerrSearchResult } from '@/types';

type Section = { title: string; items: JellyseerrSearchResult[] };

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JellyseerrSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [discover, setDiscover] = useState<Section[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  useEffect(() => {
    loadDiscover();
  }, []);

  async function loadDiscover() {
    setDiscoverLoading(true);
    try {
      const [trending, movies, tv, anime, upcoming] = await Promise.all([
        Jellyseerr.discoverTrending().catch(() => []),
        Jellyseerr.discoverMovies().catch(() => []),
        Jellyseerr.discoverTv().catch(() => []),
        Jellyseerr.discoverAnime().catch(() => []),
        Jellyseerr.discoverUpcomingMovies().catch(() => []),
      ]);
      setDiscover([
        { title: 'Trending', items: trending },
        { title: 'Popular Movies', items: movies },
        { title: 'Popular TV', items: tv },
        { title: 'Anime', items: anime },
        { title: 'Upcoming', items: upcoming },
      ].filter(s => s.items.length > 0));
    } finally {
      setDiscoverLoading(false);
    }
  }

  async function doSearch() {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const r = await Jellyseerr.search(query);
      setResults(r.filter(x => x.mediaType !== 'person'));
    } catch (e: any) {
      Alert.alert('Search failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function request(item: JellyseerrSearchResult) {
    try {
      await Jellyseerr.createRequest(item.mediaType as 'movie' | 'tv', item.id, item.mediaType === 'tv' ? 'all' : undefined);
      Alert.alert('Requested', `${item.title ?? item.name} sent to Jellyseerr`);
    } catch (e: any) {
      Alert.alert('Request failed', e?.response?.data?.message ?? e?.message ?? 'Unknown error');
    }
  }

  const showingSearch = query.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search movies and TV"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={doSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {showingSearch ? (
        busy ? (
          <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={r => `${r.mediaType}-${r.id}`}
            renderItem={({ item }) => <ResultRow item={item} onRequest={() => request(item)} />}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No results</Text>
              </View>
            }
          />
        )
      ) : discoverLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.sm }} showsVerticalScrollIndicator={false}>
          {discover.map(sec => (
            <DiscoverRow key={sec.title} section={sec} onRequest={request} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function DiscoverRow({ section, onRequest }: { section: Section; onRequest: (item: JellyseerrSearchResult) => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <FlatList
        horizontal
        data={section.items}
        keyExtractor={i => `${section.title}-${i.mediaType}-${i.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        renderItem={({ item }) => <DiscoverCard item={item} onRequest={() => onRequest(item)} />}
      />
    </View>
  );
}

function DiscoverCard({ item, onRequest }: { item: JellyseerrSearchResult; onRequest: () => void }) {
  const title = item.title ?? item.name ?? '';
  const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null;
  const available = item.mediaInfo?.status === 5;
  const requested = (item.mediaInfo?.requests?.length ?? 0) > 0;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onRequest} disabled={available}>
      <View style={styles.posterWrap}>
        {poster ? (
          <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]} />
        )}
        {available ? (
          <View style={[styles.badgeOverlay, styles.badgeAvailable]}><Text style={styles.badgeOverlayText}>Available</Text></View>
        ) : requested ? (
          <View style={[styles.badgeOverlay, styles.badgePending]}><Text style={styles.badgeOverlayText}>Requested</Text></View>
        ) : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.cardMeta}>{item.mediaType === 'movie' ? 'Movie' : 'TV'}</Text>
    </TouchableOpacity>
  );
}

function ResultRow({ item, onRequest }: { item: JellyseerrSearchResult; onRequest: () => void }) {
  const title = item.title ?? item.name ?? '';
  const year = (item.releaseDate ?? item.firstAirDate ?? '').slice(0, 4);
  const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null;
  const available = item.mediaInfo?.status === 5;
  const requested = (item.mediaInfo?.requests?.length ?? 0) > 0;

  return (
    <View style={styles.row}>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.posterEmpty]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rowMeta}>{item.mediaType === 'movie' ? 'Movie' : 'TV'} {year ? `· ${year}` : ''}</Text>
        {item.overview ? <Text style={styles.rowOverview} numberOfLines={2}>{item.overview}</Text> : null}
      </View>
      {available ? (
        <View style={[styles.badge, styles.badgeAvailable]}><Text style={styles.badgeText}>Available</Text></View>
      ) : requested ? (
        <View style={[styles.badge, styles.badgePending]}><Text style={styles.badgeText}>Requested</Text></View>
      ) : (
        <TouchableOpacity style={styles.requestBtn} onPress={onRequest} activeOpacity={0.8}>
          <Text style={styles.requestBtnText}>Request</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const CARD_WIDTH = 120;
const CARD_HEIGHT = 180;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyText: { ...type.body, color: colors.textDim },
  searchBar: { padding: spacing.lg, paddingTop: spacing.md },
  input: {
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  section: { marginBottom: spacing.xl },
  sectionHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { ...type.h2, color: colors.text },

  card: { width: CARD_WIDTH },
  posterWrap: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  poster: { width: '100%', height: '100%' },
  posterEmpty: { backgroundColor: colors.surface },
  cardTitle: { marginTop: spacing.sm, ...type.small, color: colors.text },
  cardMeta: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: 2 },

  badgeOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassTint,
  },
  badgeOverlayText: { color: colors.text, fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },

  row: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, alignItems: 'center' },
  thumb: { width: 60, height: 90, borderRadius: radius.sm, backgroundColor: colors.surface },
  rowText: { flex: 1 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.xs },
  rowOverview: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 60 + spacing.md },

  requestBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.pill },
  requestBtnText: { color: colors.accentContrast, fontSize: 13, fontWeight: '600' },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  badgeAvailable: { borderColor: colors.border, backgroundColor: colors.surface },
  badgePending: { borderColor: colors.border, backgroundColor: colors.surface },
  badgeText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },
});
