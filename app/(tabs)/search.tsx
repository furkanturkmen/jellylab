import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';

import { Text, View } from '@/components/Themed';
import * as Jellyseerr from '@/api/jellyseerr';
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
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search movies + TV"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={doSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {busy ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={r => `${r.mediaType}-${r.id}`}
          renderItem={({ item }) => <ResultRow item={item} onRequest={() => request(item)} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 40 }}
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
        <Image source={{ uri: poster }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rowMeta}>{item.mediaType.toUpperCase()} {year ? `· ${year}` : ''}</Text>
        <Text style={styles.rowOverview} numberOfLines={2}>{item.overview}</Text>
      </View>
      {available ? (
        <View style={styles.badgeOk}><Text style={styles.badgeText}>Available</Text></View>
      ) : requested ? (
        <View style={styles.badgePending}><Text style={styles.badgeText}>Requested</Text></View>
      ) : (
        <TouchableOpacity style={styles.requestBtn} onPress={onRequest}>
          <Text style={styles.requestBtnText}>Request</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: { padding: 12 },
  input: { height: 44, borderRadius: 10, backgroundColor: '#222', color: '#fff', paddingHorizontal: 12 },
  row: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'center' },
  thumb: { width: 60, height: 90, borderRadius: 4, backgroundColor: '#222' },
  thumbEmpty: {},
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  rowOverview: { fontSize: 12, opacity: 0.8, marginTop: 4 },
  sep: { height: 1, backgroundColor: '#222' },
  requestBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#4a7cff', borderRadius: 6 },
  requestBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  badgeOk: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#2a7', borderRadius: 4 },
  badgePending: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#a72', borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 11 },
});
