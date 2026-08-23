import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import axios from 'axios';

import { useCurrentServer } from '@/hooks/useServer';
import { upsertServer } from '@/store/servers';
import { colors, radius, spacing, type } from '@/theme';

export default function ServerEditScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { servers } = useCurrentServer();

  const existing = useMemo(() => (id ? servers.find(s => s.id === id) : null), [id, servers]);

  const [name, setName] = useState(existing?.name ?? '');
  const [jellyfinUrl, setJellyfinUrl] = useState(existing?.jellyfinUrl ?? 'http://');
  const [jellyseerrUrl, setJellyseerrUrl] = useState(existing?.jellyseerrUrl ?? 'http://');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ jf: 'ok' | 'fail' | 'idle'; js: 'ok' | 'fail' | 'idle'; error?: string }>({ jf: 'idle', js: 'idle' });

  async function onTest() {
    if (!jellyfinUrl.trim() || !jellyseerrUrl.trim()) {
      Alert.alert(t('serverEdit.missingTitle'), t('serverEdit.missingBody'));
      return;
    }
    setTesting(true);
    setTestResult({ jf: 'idle', js: 'idle' });
    const jf = jellyfinUrl.trim().replace(/\/+$/, '');
    const js = jellyseerrUrl.trim().replace(/\/+$/, '');
    let jfResult: 'ok' | 'fail' = 'fail';
    let jsResult: 'ok' | 'fail' = 'fail';
    let error: string | undefined;
    try {
      const r = await axios.get(`${jf}/System/Info/Public`, { timeout: 8000 });
      if (r.status === 200 && r.data?.Id) jfResult = 'ok';
    } catch (e: any) {
      error = `Jellyfin: ${e?.message ?? 'unreachable'}`;
    }
    try {
      const r = await axios.get(`${js}/api/v1/status`, { timeout: 8000 });
      if (r.status === 200 && r.data?.version) jsResult = 'ok';
    } catch (e: any) {
      error = error ? `${error}\nJellyseerr: ${e?.message ?? 'unreachable'}` : `Jellyseerr: ${e?.message ?? 'unreachable'}`;
    }
    setTestResult({ jf: jfResult, js: jsResult, error });
    setTesting(false);
  }

  async function onSave() {
    if (!name.trim() || !jellyfinUrl.trim() || !jellyseerrUrl.trim()) {
      Alert.alert(t('serverEdit.missingTitle'), t('serverEdit.missingBody'));
      return;
    }
    setBusy(true);
    try {
      await upsertServer({
        id: existing?.id,
        name,
        jellyfinUrl,
        jellyseerrUrl,
      });
      if (existing) {
        router.back();
      } else {
        // First-time add: skip the servers list and go straight to login.
        router.replace('/login');
      }
    } catch (e: any) {
      Alert.alert(t('common.failed'), e?.message ?? t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: existing ? t('serverEdit.editTitle') : t('serverEdit.addTitle'),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>{t('serverEdit.name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('serverEdit.namePlaceholder')}
            placeholderTextColor={colors.textDim}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>{t('serverEdit.jellyfinUrl')}</Text>
          <TextInput
            style={styles.input}
            placeholder="https://jellyfin.example.com"
            placeholderTextColor={colors.textDim}
            value={jellyfinUrl}
            onChangeText={setJellyfinUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>{t('serverEdit.jellyseerrUrl')}</Text>
          <TextInput
            style={styles.input}
            placeholder="https://jellyseerr.example.com"
            placeholderTextColor={colors.textDim}
            value={jellyseerrUrl}
            onChangeText={setJellyseerrUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.hint}>{t('serverEdit.hint')}</Text>

          {testResult.jf !== 'idle' || testResult.js !== 'idle' ? (
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Jellyfin</Text>
                <View style={[styles.resultPill, testResult.jf === 'ok' ? styles.pillOk : styles.pillFail]}>
                  <Text style={styles.resultPillText}>{testResult.jf === 'ok' ? '✓ Reachable' : '✕ Unreachable'}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Jellyseerr</Text>
                <View style={[styles.resultPill, testResult.js === 'ok' ? styles.pillOk : styles.pillFail]}>
                  <Text style={styles.resultPillText}>{testResult.js === 'ok' ? '✓ Reachable' : '✕ Unreachable'}</Text>
                </View>
              </View>
              {testResult.error ? <Text style={styles.errorText}>{testResult.error}</Text> : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.secondaryButton, testing && { opacity: 0.5 }]}
            onPress={onTest}
            disabled={testing || busy}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>{testing ? t('common.loading') : t('serverEdit.testConnection')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, busy && { opacity: 0.5 }]}
            onPress={onSave}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>{busy ? t('common.loading') : t('common.save')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
  hint: { ...type.caption, color: colors.textMuted, marginTop: spacing.md, lineHeight: 18 },
  resultCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  resultLabel: { ...type.body, color: colors.text },
  resultPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillOk: { backgroundColor: 'rgba(45, 200, 120, 0.18)' },
  pillFail: { backgroundColor: 'rgba(249, 38, 114, 0.18)' },
  resultPillText: { ...type.caption, color: colors.text, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  errorText: { ...type.caption, color: colors.pink, marginTop: spacing.sm },
  secondaryButton: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  saveButton: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: { color: colors.accentContrast, fontSize: 16, fontWeight: '700' },
});
