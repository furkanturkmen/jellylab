import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, type } from '@/theme';
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
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={libs}
      keyExtractor={l => l.view.Id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.text} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingSmall}>Welcome back</Text>
            <Text style={styles.greeting}>{state.auth.userName}</Text>
          </View>
          <TouchableOpacity onPress={signOut} style={styles.signOutPill}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      }
      renderItem={({ item }) => <LibraryRow lib={item} />}
      contentContainerStyle={{ paddingBottom: 120 }}
    />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  greetingSmall: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  greeting: { ...type.h1, color: colors.text },
  signOutPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  signOutText: { color: colors.textMuted, ...type.small },
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
