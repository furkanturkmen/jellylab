import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { setLanguage, SUPPORTED_LANGS, type SupportedLang } from '@/i18n';
import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

export default function LanguageSettings() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    loadPrefs().then(setPrefs);
  }, []);

  async function pick(lang: 'system' | SupportedLang) {
    if (!prefs) return;
    const next = { ...prefs, uiLanguage: lang };
    setPrefs(next);
    await savePrefs(next);
    await setLanguage(lang);
  }

  if (!prefs) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('settings.language.title'), headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Row
            label={t('settings.language.systemDefault')}
            selected={prefs.uiLanguage === 'system'}
            onPress={() => pick('system')}
          />
          {SUPPORTED_LANGS.map(l => (
            <Row
              key={l}
              label={t(`languages.${l}`)}
              selected={prefs.uiLanguage === l}
              onPress={() => pick(l)}
            />
          ))}
        </View>
        <Text style={styles.note}>{t('settings.language.note')}</Text>
      </ScrollView>
    </View>
  );
}

function Row({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { ...type.body, color: colors.text },
  rowLabelSelected: { fontWeight: '600' },
  check: { color: colors.text, fontSize: 18 },
  note: { ...type.small, color: colors.textMuted, marginTop: spacing.md, lineHeight: 20 },
});
