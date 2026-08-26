import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Button, Form, Host, Label, LabeledContent, ProgressView, Section as UISection, Text as UIText } from '@expo/ui/swift-ui';

import * as Jellyfin from '@/api/jellyfin';
import * as Push from '@/api/push';
import { getJellyfinUrl, getJellyseerrUrl } from '@/config';
import { loadPrefs } from '@/store/prefs';
import { useAuth } from '@/hooks/useAuth';
import { loadJellyfinAuth, saveJellyfinAuth } from '@/store/auth';
import { formatBytes } from '@/lib/bytes';
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

      {/*
        * The avatar stays ours - it is a remote image with an upload behind
        * it, and SwiftUI's Image takes SF Symbols and bundled assets, not a
        * URL. It sits above the form rather than inside it.
        */}
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

      {/*
        * Everything below is one SwiftUI Form, and it does its own scrolling.
        *
        * It used to sit inside a ScrollView, which is what made it invisible:
        * a Host has no intrinsic height there, so every row rendered into a
        * zero-tall view and the screen showed the avatar and nothing else.
        * Measuring the content and applying the height back did not help
        * either. One scroller, owned by SwiftUI, ends the negotiation.
        */}
      <Host style={styles.form} colorScheme="dark">
        <Form>
          <UISection>
            <Button onPress={editName}>
              <LabeledContent label={t('profile.displayName')}>
                <UIText>{user?.Name ?? state.auth.userName}</UIText>
              </LabeledContent>
            </Button>
            <Button onPress={() => router.push('/settings/password')}>
              <Label title={t('profile.changePassword')} systemImage="key" />
            </Button>
            <Button onPress={() => router.push('/history')}>
              <Label title={t('profile.menu.history')} systemImage="clock.arrow.circlepath" />
            </Button>
          </UISection>

          <UISection title={t('profile.preferences')}>
            <Button onPress={() => router.push('/settings/subtitles')}>
              <Label title={t('profile.menu.subtitles')} systemImage="captions.bubble" />
            </Button>
            <Button onPress={() => router.push('/settings/playback')}>
              <Label title={t('profile.menu.playback')} systemImage="play.rectangle" />
            </Button>
            <Button onPress={() => router.push('/settings/content')}>
              <Label title={t('profile.menu.content')} systemImage="eye" />
            </Button>
            <Button onPress={() => router.push('/settings/language')}>
              <Label title={t('profile.menu.language')} systemImage="globe" />
            </Button>
            <Button onPress={() => router.push('/settings/about')}>
              <Label title={t('profile.menu.about')} systemImage="info.circle" />
            </Button>
          </UISection>

          {isAdmin ? (
            <UISection title={t('profile.adminJellyfin')}>
              <Button onPress={() => openWeb('/web/#/dashboard.html')}>
                <Label title={t('profile.adminMenu.dashboard')} systemImage="chart.bar" />
              </Button>
              <Button onPress={() => openWeb('/web/#/dashboard/libraries')}>
                <Label title={t('profile.adminMenu.metadataManager')} systemImage="folder" />
              </Button>
              <Button onPress={() => openWeb('/web/#/dashboard/users')}>
                <Label title={t('profile.adminMenu.users')} systemImage="person.2" />
              </Button>
              <Button onPress={() => openWeb('/web/#/dashboard/plugins')}>
                <Label title={t('profile.adminMenu.plugins')} systemImage="puzzlepiece" />
              </Button>
              <Button onPress={() => openWeb('/web/#/dashboard/logs')}>
                <Label title={t('profile.adminMenu.serverLogs')} systemImage="doc.text" />
              </Button>
            </UISection>
          ) : null}

          {isAdmin ? (
            <UISection title={t('profile.adminJellyseerr')}>
              <Button onPress={() => openJellyseerr('/requests')}>
                <Label title={t('profile.adminMenu.requests')} systemImage="tray.and.arrow.down" />
              </Button>
              <Button onPress={() => openJellyseerr('/users')}>
                <Label title={t('profile.adminMenu.users')} systemImage="person.2" />
              </Button>
              <Button onPress={() => openJellyseerr('/settings')}>
                <Label title={t('profile.adminMenu.settings')} systemImage="gearshape" />
              </Button>
            </UISection>
          ) : null}

          {/* The storage bar was a drawing of exactly this. */}
          {storage ? (
            <UISection
              title={t('profile.storage')}
              footer={<UIText>{`${formatBytes(storage.used)} · ${t('profile.ofTotal', { total: formatBytes(storage.total) })}`}</UIText>}
            >
              <ProgressView value={storage.total > 0 ? storage.used / storage.total : null} />
            </UISection>
          ) : null}

          <UISection title={t('profile.app')}>
            <Button onPress={() => router.push('/servers')}>
              <Label title={t('profile.menu.servers')} systemImage="server.rack" />
            </Button>
          </UISection>

          <UISection>
            <Button role="destructive" onPress={signOut}>
              <UIText>{t('profile.signOutOfServer', { name: getJellyfinUrl().replace(/^https?:\/\//, '') })}</UIText>
            </Button>
          </UISection>
        </Form>
      </Host>
    </View>
  );
}


function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
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
  form: { flex: 1 },
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
