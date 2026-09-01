import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/useAuth';
import { getSeerrError } from '@/store/seerrStatus';
import { useCurrentServer } from '@/hooks/useServer';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing, type } from '@/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { server } = useCurrentServer();
  const router = useRouter();
  // Filled in when the switcher sent us here, so signing in as somebody the
  // device already knows is one field rather than two and a spelling.
  const { username: prefill } = useLocalSearchParams<{ username?: string }>();
  const [username, setUsername] = useState(prefill ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!username || !password) return;
    setBusy(true);
    try {
      await signIn(username, password);
      // Sign-in can half-succeed. Saying so here, once, beats letting the user
      // discover it later as a Requests tab and a search that return nothing.
      const seerr = getSeerrError();
      if (seerr) {
        Alert.alert(t('login.partialTitle'), t('login.partialBody', { error: seerr }));
      }
    } catch (e: any) {
      Alert.alert(t('login.failed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/mark.png')}
            style={styles.mark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.brand}>{t('login.title')}</Text>
          <TouchableOpacity onPress={() => router.push('/servers')} activeOpacity={0.7} style={styles.hostChip}>
            <Text style={styles.hostLabel}>
              {server ? server.jellyfinUrl.replace(/^https?:\/\//, '') : t('login.tapToConfigureServer')}
            </Text>
            <Text style={styles.hostChev}>›</Text>
          </TouchableOpacity>
        </View>

        <BlurView tint="dark" intensity={40} style={styles.card}>
          <View style={styles.cardInner}>
            <Text style={styles.fieldLabel}>{t('login.username')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('login.usernamePlaceholder')}
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>{t('login.password')}</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>{busy ? t('login.signingIn') : t('login.signIn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/servers')}
              activeOpacity={0.7}
              style={styles.manageLink}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.manageLinkText}>{t('login.manageServers')}</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  header: { marginBottom: spacing.xxl, alignItems: 'center' },
  // taller than wide (364:512), so contain inside a square box
  mark: { width: 76, height: 76, marginBottom: spacing.md },
  brand: { ...type.display, color: colors.text, marginBottom: spacing.md },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  hostLabel: { ...type.caption, color: colors.text, textTransform: 'uppercase' },
  hostChev: { color: colors.textMuted, fontSize: 16, marginTop: -2 },
  manageLink: { alignItems: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm },
  manageLinkText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassTint,
  },
  cardInner: { padding: spacing.xl },
  fieldLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  input: {
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.accentContrast, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
});
