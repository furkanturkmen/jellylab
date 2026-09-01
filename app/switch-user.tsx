import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { forgetAccount, loadAccounts, type KnownAccount } from '@/store/accounts';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Pick up where somebody else left off.
 *
 * This cannot avoid asking for a password. Jellyseerr authenticates by doing
 * its own Jellyfin login with a username and password - there is no token it
 * will accept - so an account switched without one would have a library and no
 * Requests, Search or Discover, which is the failure this screen exists to
 * stop rather than to cause.
 *
 * What it does remove is the other half: remembering who exists turns signing
 * in as someone else from two fields and a spelling into one field.
 */
export default function SwitchUserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, signOut } = useAuth();
  const [accounts, setAccounts] = useState<KnownAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const currentId = state.status === 'signed-in' ? state.auth.userId : null;

  const load = useCallback(async () => {
    try {
      setAccounts(await loadAccounts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pick(account: KnownAccount) {
    if (account.userId === currentId) return;
    /*
     * Signed out before the login screen opens, not after a password is
     * accepted: the Jellyseerr session lives in a cookie jar this app cannot
     * read, and leaving the previous one in place is how a sign-in ends up
     * talking to Seerr as the wrong person.
     */
    await signOut();
    router.replace({ pathname: '/login', params: { username: account.userName } });
  }

  function onForget(account: KnownAccount) {
    Alert.alert(
      t('switchUser.forgetTitle'),
      t('switchUser.forgetBody', { name: account.userName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('switchUser.forget'),
          style: 'destructive',
          onPress: async () => {
            await forgetAccount(account.userId);
            load();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('switchUser.title') }} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
      ) : (
        <View style={styles.list}>
          {accounts.map(a => {
            const active = a.userId === currentId;
            return (
              <TouchableOpacity
                key={a.userId}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => pick(a)}
                onLongPress={() => onForget(a)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={active ? t('switchUser.current', { name: a.userName }) : a.userName}
              >
                {a.primaryImageTag ? (
                  <Image
                    source={{ uri: Jellyfin.userImageUrl(a.userId, a.primaryImageTag, 120) }}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.initial}>{a.userName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.name}>{a.userName}</Text>
                  {active ? <Text style={styles.meta}>{t('switchUser.signedIn')}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.row}
            onPress={async () => {
              await signOut();
              router.replace('/login');
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.initial}>+</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.name}>{t('switchUser.add')}</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.note}>{t('switchUser.note')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
  },
  rowActive: { borderWidth: 1, borderColor: colors.text },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initial: { ...type.body, color: colors.textMuted },
  rowText: { flex: 1 },
  name: { ...type.body, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  note: { ...type.caption, color: colors.textDim, marginTop: spacing.sm, lineHeight: 18 },
});
