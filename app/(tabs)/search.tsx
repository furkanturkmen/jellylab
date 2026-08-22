import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';

import * as Jellyseerr from '@/api/jellyseerr';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyseerrSearchResult } from '@/types';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JellyseerrSearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function doSearch() {
    if (!query.trim()) return;
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
        />
      </View>
      {busy ? (
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={r => `${r.mediaType}-${r.id}`}
          renderItem={({ item }) => <ResultRow item={item} onRequest={() => request(item)} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}
    </View>
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
        <View style={[styles.thumb, styles.thumbEmpty]} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  row: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, alignItems: 'center' },
  thumb: { width: 60, height: 90, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbEmpty: {},
  rowText: { flex: 1 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.xs },
  rowOverview: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 60 + spacing.md },
  requestBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  requestBtnText: { color: colors.accentContrast, fontSize: 13, fontWeight: '600' },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  badgeAvailable: { borderColor: colors.border, backgroundColor: colors.surface },
  badgePending: { borderColor: colors.border, backgroundColor: colors.surface },
  badgeText: { color: colors.text, ...type.caption, textTransform: 'uppercase' },
});
