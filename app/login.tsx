import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/useAuth';
import { CONFIG } from '@/config';
import { colors, radius, spacing, type } from '@/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!username || !password) return;
    setBusy(true);
    try {
      await signIn(username, password);
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
          <Text style={styles.brand}>{t('login.title')}</Text>
          <Text style={styles.hostLabel}>{CONFIG.JELLYFIN_URL.replace(/^https?:\/\//, '')}</Text>
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
  brand: { ...type.display, color: colors.text, marginBottom: spacing.xs },
  hostLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase' },
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
