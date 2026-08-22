import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import * as Jellyseerr from '@/api/jellyseerr';
import { MEDIA_STATUS, REQUEST_STATUS, type JellyseerrRequest } from '@/types';
import { colors, radius, spacing, type as t } from '@/theme';

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
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={r => String(r.id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
      renderItem={({ item }) => <RequestRow r={item} />}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 120 }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>No requests yet</Text>
        </View>
      }
    />
  );
}

function RequestRow({ r }: { r: JellyseerrRequest }) {
  const requestStatus = REQUEST_STATUS[r.status] ?? '?';
  const mediaStatus = MEDIA_STATUS[r.media.status] ?? '?';
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.type}>{r.media.mediaType === 'movie' ? 'Movie' : 'TV'} · TMDB {r.media.tmdbId}</Text>
        <View style={styles.pillRow}>
          <View style={styles.pill}><Text style={styles.pillText}>{requestStatus}</Text></View>
          <View style={styles.pill}><Text style={styles.pillText}>{mediaStatus}</Text></View>
        </View>
        <Text style={styles.by}>{r.requestedBy.displayName} · {new Date(r.createdAt).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: colors.bg },
  empty: { ...t.body, color: colors.textDim },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row' },
  type: { ...t.caption, color: colors.textMuted, textTransform: 'uppercase' },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pillText: { color: colors.text, ...t.caption, textTransform: 'uppercase' },
  by: { ...t.small, color: colors.textDim, marginTop: spacing.sm },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
});
