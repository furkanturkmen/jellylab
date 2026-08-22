import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';

import { Text, View } from '@/components/Themed';
import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import type { JellyfinItem, JellyfinView } from '@/types';

type LibraryItem = { view: JellyfinView; items: JellyfinItem[] };

export default function LibraryScreen() {
  const { state, signOut } = useAuth();
  const [libs, setLibs] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (state.status !== 'signed-in') return;
    setLoading(true);
    try {
      const views = await Jellyfin.getViews(state.auth.userId);
      const filtered = views.filter(v => v.CollectionType === 'movies' || v.CollectionType === 'tvshows');
      const withItems = await Promise.all(
        filtered.map(async view => ({
          view,
          items: await Jellyfin.getItems(state.auth.userId, view.Id, 20),
        }))
      );
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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={libs}
      keyExtractor={l => l.view.Id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.hello}>Hi, {state.auth.userName}</Text>
          <TouchableOpacity onPress={signOut}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
        </View>
      }
      renderItem={({ item }) => <LibraryRow lib={item} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}

function LibraryRow({ lib }: { lib: LibraryItem }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{lib.view.Name}</Text>
      <FlatList
        horizontal
        data={lib.items}
        keyExtractor={i => i.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        renderItem={({ item }) => <PosterCard item={item} />}
      />
    </View>
  );
}

function PosterCard({ item }: { item: JellyfinItem }) {
  const tag = item.ImageTags?.Primary;
  return (
    <Link href={`/item/${item.Id}`} asChild>
      <TouchableOpacity style={styles.card}>
        <Image source={{ uri: Jellyfin.imageUrl(item.Id, tag) }} style={styles.poster} contentFit="cover" />
        <Text style={styles.cardTitle} numberOfLines={1}>{item.Name}</Text>
        {item.ProductionYear ? <Text style={styles.cardYear}>{item.ProductionYear}</Text> : null}
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  hello: { fontSize: 20, fontWeight: '600' },
  signOut: { color: '#4a7cff' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8 },
  card: { width: 120 },
  poster: { width: 120, height: 180, borderRadius: 6, backgroundColor: '#222' },
  cardTitle: { marginTop: 6, fontSize: 13 },
  cardYear: { fontSize: 11, opacity: 0.6 },
});
