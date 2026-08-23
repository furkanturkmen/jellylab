import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { useCurrentServer } from '@/hooks/useServer';
import { deleteServer, setCurrentServer } from '@/store/servers';
import { clearJellyfinAuth, clearJellyseerrAuth } from '@/store/auth';
import { colors, radius, spacing, type } from '@/theme';
import type { Server } from '@/types';

export default function ServersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { server, servers } = useCurrentServer();

  async function switchTo(s: Server) {
    if (s.id === server?.id) return;
    await clearJellyfinAuth();
    await clearJellyseerrAuth();
    await setCurrentServer(s.id);
    router.replace('/login');
  }

  async function confirmDelete(s: Server) {
    Alert.alert(
      t('servers.deleteTitle'),
      t('servers.deleteMessage', { name: s.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const wasCurrent = s.id === server?.id;
            await deleteServer(s.id);
            if (wasCurrent) {
              await clearJellyfinAuth();
              await clearJellyseerrAuth();
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('servers.title'),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/server-edit')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={colors.text} size={22} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {servers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('servers.noneTitle')}</Text>
            <Text style={styles.emptyBody}>{t('servers.noneBody')}</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => router.push('/server-edit')} activeOpacity={0.85}>
              <Text style={styles.addButtonText}>{t('servers.addFirst')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            {servers.map((s, i) => {
              const isCurrent = s.id === server?.id;
              return (
                <View key={s.id}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => switchTo(s)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{s.name}</Text>
                      <Text style={styles.rowUrl}>{s.jellyfinUrl.replace(/^https?:\/\//, '')}</Text>
                    </View>
                    {isCurrent ? (
                      <View style={styles.pill}><Text style={styles.pillText}>{t('servers.active')}</Text></View>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/server-edit', params: { id: s.id } })}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={colors.textMuted} size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDelete(s)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.iconBtn}
                    >
                      <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} tintColor={colors.pink} size={18} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  rowName: { ...type.body, color: colors.text },
  rowUrl: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  pillText: { color: colors.accentContrast, ...type.caption, fontWeight: '700' },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyTitle: { ...type.h2, color: colors.text, marginBottom: spacing.sm },
  emptyBody: { ...type.small, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  addButton: {
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.accentContrast, fontSize: 15, fontWeight: '700' },
});
