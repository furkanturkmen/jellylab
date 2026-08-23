import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

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
      router.back();
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
  saveButton: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  saveButtonText: { color: colors.accentContrast, fontSize: 16, fontWeight: '700' },
});
