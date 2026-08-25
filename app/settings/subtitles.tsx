import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

// Codes, not labels: the names are looked up in the app's language where the
// rows are drawn, since t() does not exist at module scope.
const LANGS = ['off', 'eng', 'nld', 'tur', 'ger', 'fre', 'spa', 'jpn'];

const SIZES: Prefs['subtitleSize'][] = ['sm', 'md', 'lg'];

export default function SubtitlesSettings() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    loadPrefs().then(setPrefs);
  }, []);

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePrefs(next);
  }

  if (!prefs) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('nav.subtitles'), headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.labels.preferredSubs')}</Text>
          {LANGS.map(code => (
            <OptionRow
              key={code}
              label={t(`trackLanguages.${code}`)}
              selected={prefs.subtitleLanguage === code}
              onPress={() => update('subtitleLanguage', code)}
            />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.labels.textSize')}</Text>
          {SIZES.map(size => (
            <OptionRow
              key={size}
              label={t(`settings.subtitles.size.${size}`)}
              selected={prefs.subtitleSize === size}
              onPress={() => update('subtitleSize', size)}
            />
          ))}
        </View>

        <Text style={styles.note}>{t('settings.subtitles.note')}</Text>
      </ScrollView>
    </View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
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
  cardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.md },
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
