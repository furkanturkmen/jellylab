import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import * as Push from '@/api/push';
import { getJellyfinUrl, getJellyseerrUrl } from '@/config';
import { loadPrefs } from '@/store/prefs';
import { useAuth } from '@/hooks/useAuth';
import { loadJellyfinAuth, saveJellyfinAuth } from '@/store/auth';
import { colors, radius, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [avatarBust, setAvatarBust] = useState(Date.now());
  const [storage, setStorage] = useState<Push.StorageInfo | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (state.status !== 'signed-in') return;
    // Caught, not left to reject: an unreachable server should leave the name
    // field empty, not put a red screen over the whole app.
    Jellyfin.getCurrentUser(state.auth.userId)
      .then(setUser)
      .catch(err => console.warn('profile: could not load user —', err?.message ?? err));
  }, [state.status]);

  // Above the signed-out guard below, not after it. Hooks must run in the same
  // order on every render, and a hook placed after an early return runs only on
  // the renders that get past it - React counts five hooks while signed out and
  // six once signed in, and refuses with "Rendered more hooks than during the
  // previous render".
  //
  // Only fetches when the push service is configured, since that is what serves
  // it. Failures stay silent: this is a nice-to-know, and an error card for it
  // would be louder than the thing is worth.
  useEffect(() => {
    (async () => {
      try {
        const prefs = await loadPrefs();
        if (!prefs.pushUrl) return;
        setStorage(await Push.storage(prefs.pushUrl));
      } catch {}
    })();
  }, []);

  if (state.status !== 'signed-in') {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  const isAdmin = state.auth.isAdmin || user?.Policy?.IsAdministrator;
  const avatarUrl = Jellyfin.userImageUrl(state.auth.userId, state.auth.primaryImageTag, 240) + `&_=${avatarBust}`;

  async function pickImage(source: 'library' | 'camera') {
    if (state.status !== 'signed-in') return;
    console.log('[profile] pickImage', source);
    let perm;
    try {
      perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[profile] permission result', perm);
    } catch (e: any) {
      console.log('[profile] permission request failed', e?.message);
      Alert.alert('Permission error', e?.message ?? 'Unknown');
      return;
    }
    if (!perm.granted) {
      Alert.alert(t('profile.permissionDenied'));
      return;
    }
    const picker = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    let result;
    try {
      result = await picker({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      console.log('[profile] picker result canceled=', result.canceled);
    } catch (e: any) {
      console.log('[profile] picker crashed', e?.message);
      Alert.alert('Picker error', e?.message ?? 'Unknown');
      return;
    }
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploadingImage(true);
    try {
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      console.log('[profile] uploading', mime, 'base64 length', asset.base64?.length);
      await Jellyfin.uploadProfileImage(state.auth.userId, asset.base64!, mime);
      console.log('[profile] upload ok, refetching user');
      const refreshed = await Jellyfin.getCurrentUser(state.auth.userId);
      console.log('[profile] new PrimaryImageTag', refreshed?.PrimaryImageTag);
      const authNow = await loadJellyfinAuth();
      if (authNow) {
        await saveJellyfinAuth({ ...authNow, primaryImageTag: refreshed?.PrimaryImageTag });
      }
      setUser(refreshed);
      setAvatarBust(Date.now());
    } catch (e: any) {
      console.log('[profile] upload failed', e?.message);
      Alert.alert(t('profile.uploadFailed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setUploadingImage(false);
    }
  }

  function chooseImageSource() {
    const buttons: any[] = [
      { text: t('profile.takePhoto'), onPress: () => pickImage('camera') },
      { text: t('profile.chooseFromLibrary'), onPress: () => pickImage('library') },
    ];
    if (state.status === 'signed-in' && state.auth.primaryImageTag) {
      buttons.push({ text: t('profile.removePicture'), style: 'destructive', onPress: removeImage });
    }
    buttons.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(t('profile.changePicture'), undefined, buttons);
  }

  async function removeImage() {
    if (state.status !== 'signed-in') return;
    setUploadingImage(true);
    try {
      await Jellyfin.deleteProfileImage(state.auth.userId);
      const refreshed = await Jellyfin.getCurrentUser(state.auth.userId);
      const authNow = await loadJellyfinAuth();
      if (authNow) {
        await saveJellyfinAuth({ ...authNow, primaryImageTag: refreshed?.PrimaryImageTag });
      }
      setUser(refreshed);
      setAvatarBust(Date.now());
    } catch (e: any) {
      Alert.alert(t('common.failed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setUploadingImage(false);
    }
  }

  function editName() {
    if (state.status !== 'signed-in') return;
    Alert.prompt(
      t('profile.displayName'),
      undefined,
      async (input) => {
        if (!input || input === user?.Name) return;
        try {
          await Jellyfin.updateUserName(state.auth.userId, input.trim());
          const authNow = await loadJellyfinAuth();
          if (authNow) await saveJellyfinAuth({ ...authNow, userName: input.trim() });
          const refreshed = await Jellyfin.getCurrentUser(state.auth.userId);
          setUser(refreshed);
          Alert.alert(t('common.save'), t('profile.nameSaved'));
        } catch (e: any) {
          Alert.alert(t('common.failed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
        }
      },
      'plain-text',
      user?.Name ?? state.auth.userName,
    );
  }

  async function openWeb(path: string) {
    await WebBrowser.openBrowserAsync(`${getJellyfinUrl()}${path}`);
  }

  async function openJellyseerr(path: string) {
    await WebBrowser.openBrowserAsync(`${getJellyseerrUrl()}${path}`);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('profile.title'), headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text }, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={chooseImageSource} disabled={uploadingImage} activeOpacity={0.85}>
            <View style={styles.avatarWrap}>
              {state.auth.primaryImageTag ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitials}>{state.auth.userName?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
              {uploadingImage ? (
                <View style={styles.avatarOverlay}><ActivityIndicator color={colors.text} /></View>
              ) : null}
            </View>
          </TouchableOpacity>
          <Text style={styles.heroName}>{state.auth.userName}</Text>
          <Text style={styles.heroSub}>{getJellyfinUrl().replace(/^https?:\/\//, '')}</Text>
        </View>

        <Section>
          <Row icon="person" label={t('profile.displayName')} value={user?.Name ?? state.auth.userName} onPress={editName} />
          <Row icon="key" label={t('profile.changePassword')} onPress={() => router.push('/settings/password')} />
          <Row icon="clock.arrow.circlepath" label={t('profile.menu.history')} onPress={() => router.push('/history')} />
        </Section>

        <SectionHeader>{t('profile.preferences')}</SectionHeader>
        <Section>
          <Row icon="captions.bubble" label={t('profile.menu.subtitles')} onPress={() => router.push('/settings/subtitles')} />
          <Row icon="play.rectangle" label={t('profile.menu.playback')} onPress={() => router.push('/settings/playback')} />
          <Row icon="eye" label={t('profile.menu.content')} onPress={() => router.push('/settings/content')} />
          <Row icon="globe" label={t('profile.menu.language')} onPress={() => router.push('/settings/language')} />
          <Row icon="info.circle" label={t('profile.menu.about')} onPress={() => router.push('/settings/about')} />
        </Section>

        {isAdmin ? (
          <>
            <SectionHeader>{t('profile.adminJellyfin')}</SectionHeader>
            <Section>
              <Row icon="chart.bar" label={t('profile.adminMenu.dashboard')} onPress={() => openWeb('/web/#/dashboard.html')} />
              <Row icon="folder" label={t('profile.adminMenu.metadataManager')} onPress={() => openWeb('/web/#/dashboard/libraries')} />
              <Row icon="person.2" label={t('profile.adminMenu.users')} onPress={() => openWeb('/web/#/dashboard/users')} />
              <Row icon="puzzlepiece" label={t('profile.adminMenu.plugins')} onPress={() => openWeb('/web/#/dashboard/plugins')} />
              <Row icon="doc.text" label={t('profile.adminMenu.serverLogs')} onPress={() => openWeb('/web/#/dashboard/logs')} />
            </Section>

            <SectionHeader>{t('profile.adminJellyseerr')}</SectionHeader>
            <Section>
              <Row icon="tray.and.arrow.down" label={t('profile.adminMenu.requests')} onPress={() => openJellyseerr('/requests')} />
              <Row icon="person.2" label={t('profile.adminMenu.users')} onPress={() => openJellyseerr('/users')} />
              <Row icon="gearshape" label={t('profile.adminMenu.settings')} onPress={() => openJellyseerr('/settings')} />
            </Section>
          </>
        ) : null}

        {storage ? (
          <>
            <SectionHeader>{t('profile.storage')}</SectionHeader>
            <StorageCard info={storage} />
          </>
        ) : null}

        <SectionHeader>{t('profile.app')}</SectionHeader>
        <Section>
          <Row icon="server.rack" label={t('profile.menu.servers')} onPress={() => router.push('/servers')} />
        </Section>

        <View style={styles.signOutWrap}>
          <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.85}>
            <Text style={styles.signOutText}>{t('profile.signOutOfServer', { name: getJellyfinUrl().replace(/^https?:\/\//, '') })}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

/** Free space below this and the server's disk-guard stops qBittorrent. */
const LOW_SPACE_BYTES = 40 * 1024 ** 3;

function formatBytes(n: number): string {
  const gb = n / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(0)} GB`;
}

/**
 * Used/free on the media drive.
 *
 * The bar turns amber below 40 GB free, which is not an arbitrary number: it
 * is the threshold the server's own disk-guard uses to stop qBittorrent. So
 * the moment this changes colour is the moment downloads are about to halt,
 * rather than some generic "nearly full" that means nothing in particular.
 */
function StorageCard({ info }: { info: Push.StorageInfo }) {
  const { t } = useTranslation();
  const ratio = info.total > 0 ? Math.max(0, Math.min(1, info.used / info.total)) : 0;
  const low = info.free < LOW_SPACE_BYTES;

  return (
    <View style={styles.section}>
      <View style={styles.storageWrap}>
        <View style={styles.storageTop}>
          <Text style={styles.storageUsed}>{formatBytes(info.used)}</Text>
          <Text style={styles.storageTotal}>{t('profile.ofTotal', { total: formatBytes(info.total) })}</Text>
        </View>
        <View style={styles.storageTrack}>
          <View style={[styles.storageFill, { width: `${ratio * 100}%` }, low && styles.storageFillLow]} />
        </View>
        <Text style={[styles.storageFree, low && styles.storageFreeLow]}>
          {low
            ? t('profile.storageLow', { free: formatBytes(info.free) })
            : t('profile.storageFree', { free: formatBytes(info.free) })}
        </Text>
      </View>
    </View>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.flat() : [children];
  return (
    <View style={styles.section}>
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {i < items.length - 1 ? <View style={styles.sep} /> : null}
        </View>
      ))}
    </View>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

function Row({ icon, label, value, onPress }: { icon: any; label: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowIconWrap}>
        <SymbolView name={icon} tintColor={colors.text} size={20} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
}

const AVATAR_SIZE = 120;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  avatarWrap: { alignItems: 'center' },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: colors.surface },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.text, fontSize: 48, fontWeight: '700' },
  avatarOverlay: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  heroName: { ...type.h1, color: colors.text, marginTop: spacing.md },
  heroSub: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },

  storageWrap: { padding: spacing.lg, gap: spacing.sm },
  storageTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  storageUsed: { ...type.h1, color: colors.text },
  storageTotal: { ...type.body, color: colors.textMuted },
  storageTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  storageFill: { height: '100%', borderRadius: 4, backgroundColor: colors.text },
  storageFillLow: { backgroundColor: '#FF9F0A' },
  storageFree: { ...type.small, color: colors.textMuted },
  storageFreeLow: { color: '#FF9F0A' },
  sectionHeader: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  section: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowIconWrap: { width: 28, alignItems: 'center' },
  rowLabel: { ...type.body, color: colors.text, flex: 1 },
  rowValue: { ...type.small, color: colors.textMuted, marginRight: spacing.xs, maxWidth: 140 },
  rowArrow: { color: colors.textDim, fontSize: 22 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 28 + spacing.md * 2 },

  signOutWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  signOutBtn: {
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 69, 58, 0.5)',
  },
  signOutText: { color: 'rgba(255, 99, 99, 1)', ...type.body, fontWeight: '600' },
});
