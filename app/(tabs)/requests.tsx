import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { Text, View } from '@/components/Themed';
import * as Jellyseerr from '@/api/jellyseerr';
import { MEDIA_STATUS, REQUEST_STATUS, type JellyseerrRequest } from '@/types';

export default function RequestsScreen() {
  const [items, setItems] = useState<JellyseerrRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await Jellyseerr.listRequests('all');
      setItems(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && items.length === 0) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={r => String(r.id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      renderItem={({ item }) => <RequestRow r={item} />}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>No requests yet</Text>
        </View>
      }
    />
  );
}

function RequestRow({ r }: { r: JellyseerrRequest }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.type}>{r.media.mediaType.toUpperCase()} · TMDB {r.media.tmdbId}</Text>
        <Text style={styles.status}>
          Request: {REQUEST_STATUS[r.status] ?? '?'} · Media: {MEDIA_STATUS[r.media.status] ?? '?'}
        </Text>
        <Text style={styles.by}>By {r.requestedBy.displayName} · {new Date(r.createdAt).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  empty: { opacity: 0.5 },
  row: { padding: 12, flexDirection: 'row' },
  type: { fontSize: 13, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 2 },
  by: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  sep: { height: 1, backgroundColor: '#222' },
});
