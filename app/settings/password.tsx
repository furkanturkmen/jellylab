import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, type } from '@/theme';

export default function PasswordScreen() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (state.status !== 'signed-in') return;
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) {
      Alert.alert(t('profile.passwordMismatchTitle'), t('profile.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await Jellyfin.updatePassword(state.auth.userId, currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      Alert.alert(t('profile.passwordChanged'));
    } catch (e: any) {
      Alert.alert(t('common.failed'), e?.response?.data?.message ?? e?.message ?? t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('profile.changePassword'), headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={styles.group}>
            <Field label={t('profile.currentPassword')}>
              <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.textDim} />
            </Field>
            <Separator />
            <Field label={t('profile.newPassword')}>
              <TextInput style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.textDim} />
            </Field>
            <Separator />
            <Field label={t('profile.confirmNewPassword')}>
              <TextInput style={styles.input} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoCapitalize="none" placeholderTextColor={colors.textDim} />
            </Field>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || !currentPw || !newPw || newPw !== confirmPw) && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={busy || !currentPw || !newPw || newPw !== confirmPw}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, (busy || !currentPw || !newPw || newPw !== confirmPw) && styles.primaryBtnTextDisabled]}>
              {busy ? t('profile.updatingPassword') : t('profile.updatePassword')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  group: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  field: { padding: spacing.lg },
  fieldLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  input: {
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  primaryBtn: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryBtnDisabled: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  primaryBtnText: { color: colors.accentContrast, fontSize: 15, fontWeight: '600' },
  primaryBtnTextDisabled: { color: colors.textMuted },
});
