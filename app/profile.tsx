import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { CONFIG } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { loadJellyfinAuth, saveJellyfinAuth } from '@/store/auth';
import { colors, radius, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [avatarBust, setAvatarBust] = useState(Date.now());
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (state.status !== 'signed-in') return;
    Jellyfin.getCurrentUser(state.auth.userId).then(u => {
      setUser(u);
      setName(u?.Name ?? '');
    });
  }, [state.status]);

  if (state.status !== 'signed-in') {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  const isAdmin = state.auth.isAdmin || user?.Policy?.IsAdministrator;
  const avatarUrl = Jellyfin.userImageUrl(state.auth.userId, state.auth.primaryImageTag, 200) + `&_=${avatarBust}`;

  async function saveName() {
    if (state.status !== 'signed-in') return;
    if (!name.trim() || name === user?.Name) return;
    setSaving(true);
    try {
      await Jellyfin.updateUserName(state.auth.userId, name.trim());
      const updated = { ...state.auth, userName: name.trim() };
      await saveJellyfinAuth(updated);
      Alert.alert(t('common.save'), t('profile.nameSaved'));
    } catch (e: any) {
      Alert.alert(t('common.failed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (state.status !== 'signed-in') return;
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) {
      Alert.alert(t('profile.passwordMismatchTitle'), t('profile.passwordMismatch'));
      return;
    }
    setChangingPw(true);
    try {
      await Jellyfin.updatePassword(state.auth.userId, currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      Alert.alert(t('profile.passwordChanged'));
    } catch (e: any) {
      Alert.alert(t('common.failed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setChangingPw(false);
    }
  }

  async function pickImage(source: 'library' | 'camera') {
    if (state.status !== 'signed-in') return;
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('profile.permissionDenied'));
      return;
    }
    const picker = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploadingImage(true);
    try {
      const asset = result.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      await Jellyfin.uploadProfileImage(state.auth.userId, asset.base64!, mime);
      const refreshed = await Jellyfin.getCurrentUser(state.auth.userId);
      const authNow = await loadJellyfinAuth();
      if (authNow) {
        await saveJellyfinAuth({ ...authNow, primaryImageTag: refreshed?.PrimaryImageTag });
      }
      setAvatarBust(Date.now());
    } catch (e: any) {
      Alert.alert(t('profile.uploadFailed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setUploadingImage(false);
    }
  }

  function chooseImageSource() {
    Alert.alert(t('profile.changePicture'), undefined, [
      { text: t('profile.takePhoto'), onPress: () => pickImage('camera') },
      { text: t('profile.chooseFromLibrary'), onPress: () => pickImage('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function openWeb(path: string) {
    await WebBrowser.openBrowserAsync(`${CONFIG.JELLYFIN_URL}${path}`);
  }

  async function openJellyseerr(path: string) {
    await WebBrowser.openBrowserAsync(`${CONFIG.JELLYSEERR_URL}${path}`);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('profile.title'), headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarBlock}>
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
            <Text style={styles.avatarHint}>{t('profile.tapToChange')}</Text>
          </TouchableOpacity>
        </View>

        <Card>
          <Field label={t('profile.displayName')}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <TouchableOpacity
            style={[styles.primaryBtn, (saving || name === user?.Name) && styles.primaryBtnDisabled]}
            onPress={saveName}
            disabled={saving || !name.trim() || name === user?.Name}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, (saving || name === user?.Name) && styles.primaryBtnTextDisabled]}>
              {saving ? t('profile.saving') : t('profile.saveName')}
            </Text>
          </TouchableOpacity>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>{t('profile.changePassword')}</Text>
          <Field label={t('profile.currentPassword')}>
            <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw} placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" />
          </Field>
          <Field label={t('profile.newPassword')}>
            <TextInput style={styles.input} value={newPw} onChangeText={setNewPw} placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" />
          </Field>
          <Field label={t('profile.confirmNewPassword')}>
            <TextInput style={styles.input} value={confirmPw} onChangeText={setConfirmPw} placeholderTextColor={colors.textDim} secureTextEntry autoCapitalize="none" />
          </Field>
          <TouchableOpacity
            style={[styles.primaryBtn, changingPw && styles.primaryBtnDisabled]}
            onPress={changePassword}
            disabled={changingPw || !currentPw || !newPw || newPw !== confirmPw}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, changingPw && styles.primaryBtnTextDisabled]}>
              {changingPw ? t('profile.updatingPassword') : t('profile.updatePassword')}
            </Text>
          </TouchableOpacity>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>{t('profile.preferences')}</Text>
          <MenuRow label={t('profile.menu.subtitles')} onPress={() => router.push('/settings/subtitles')} />
          <MenuRow label={t('profile.menu.playback')} onPress={() => router.push('/settings/playback')} />
          <MenuRow label={t('profile.menu.content')} onPress={() => router.push('/settings/content')} />
          <MenuRow label={t('profile.menu.language')} onPress={() => router.push('/settings/language')} />
        </Card>

        {isAdmin ? (
          <Card>
            <Text style={styles.cardLabel}>{t('profile.adminJellyfin')}</Text>
            <MenuRow label={t('profile.adminMenu.dashboard')} onPress={() => openWeb('/web/#/dashboard.html')} />
            <MenuRow label={t('profile.adminMenu.metadataManager')} onPress={() => openWeb('/web/#/dashboard/libraries')} />
            <MenuRow label={t('profile.adminMenu.users')} onPress={() => openWeb('/web/#/dashboard/users')} />
            <MenuRow label={t('profile.adminMenu.plugins')} onPress={() => openWeb('/web/#/dashboard/plugins')} />
            <MenuRow label={t('profile.adminMenu.serverLogs')} onPress={() => openWeb('/web/#/dashboard/logs')} />
          </Card>
        ) : null}

        {isAdmin ? (
          <Card>
            <Text style={styles.cardLabel}>{t('profile.adminJellyseerr')}</Text>
            <MenuRow label={t('profile.adminMenu.requests')} onPress={() => openJellyseerr('/requests')} />
            <MenuRow label={t('profile.adminMenu.users')} onPress={() => openJellyseerr('/users')} />
            <MenuRow label={t('profile.adminMenu.settings')} onPress={() => openJellyseerr('/settings')} />
          </Card>
        ) : null}

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.85}>
          <Text style={styles.signOutText}>{t('common.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const AVATAR_SIZE = 112;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  avatarBlock: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl },
  avatarWrap: { alignItems: 'center' },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: colors.surface },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.text, fontSize: 44, fontWeight: '700' },
  avatarOverlay: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  avatarHint: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.md, textAlign: 'center' },

  card: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  fieldLabel: { ...type.caption, color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: {
    height: 46,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  primaryBtn: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnDisabled: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  primaryBtnText: { color: colors.accentContrast, fontSize: 15, fontWeight: '600' },
  primaryBtnTextDisabled: { color: colors.textMuted },

  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuLabel: { ...type.body, color: colors.text },
  menuArrow: { color: colors.textMuted, fontSize: 20 },

  signOutBtn: {
    marginTop: spacing.lg,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 69, 58, 0.5)',
  },
  signOutText: { color: 'rgba(255, 99, 99, 1)', ...type.body, fontWeight: '600' },
});
