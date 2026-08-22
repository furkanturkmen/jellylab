import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

const LANGS: { code: string; label: string }[] = [
  { code: 'off', label: 'Off' },
  { code: 'eng', label: 'English' },
  { code: 'nld', label: 'Dutch' },
  { code: 'tur', label: 'Turkish' },
  { code: 'ger', label: 'German' },
  { code: 'fre', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'jpn', label: 'Japanese' },
];

const SIZES: { value: Prefs['subtitleSize']; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];

export default function SubtitlesSettings() {
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
      <Stack.Screen options={{ title: 'Subtitles', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Preferred language</Text>
          {LANGS.map(l => (
            <OptionRow
              key={l.code}
              label={l.label}
              selected={prefs.subtitleLanguage === l.code}
              onPress={() => update('subtitleLanguage', l.code)}
            />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Text size</Text>
          {SIZES.map(s => (
            <OptionRow
              key={s.value}
              label={s.label}
              selected={prefs.subtitleSize === s.value}
              onPress={() => update('subtitleSize', s.value)}
            />
          ))}
        </View>

        <Text style={styles.note}>
          Preferences are stored on this device. When the player finds a matching
          subtitle track for the media, it will be selected automatically.
        </Text>
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
