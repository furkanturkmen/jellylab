import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

// These tables are module scope and t() is not, so anything that needs
// translating is carried as a language code or a key and resolved where the row
// is drawn. "8 Mbps" reads the same in every language and stays a literal.
const BITRATES: { mbps: number; label?: string; labelKey?: string }[] = [
  { mbps: 0, labelKey: 'settings.labels.originalQuality' },
  { mbps: 8, label: '8 Mbps' },
  { mbps: 4, label: '4 Mbps' },
  { mbps: 2, label: '2 Mbps' },
  { mbps: 1, label: '1 Mbps' },
];

const AUDIO = ['original', 'eng', 'nld', 'tur', 'ger', 'jpn'];

export default function PlaybackSettings() {
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
      <Stack.Screen options={{ title: t('nav.playback'), headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.labels.preferredAudio')}</Text>
          {AUDIO.map(code => (
            <OptionRow
              key={code}
              label={t(`trackLanguages.${code}`)}
              selected={prefs.audioLanguage === code}
              onPress={() => update('audioLanguage', code)}
            />
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.labels.engine')}</Text>
          <OptionRow
            label={t('settings.labels.engineAuto')}
            selected={prefs.preferredEngine === 'auto'}
            onPress={() => update('preferredEngine', 'auto')}
          />
          <OptionRow
            label={t('settings.labels.engineNative')}
            selected={prefs.preferredEngine === 'native'}
            onPress={() => update('preferredEngine', 'native')}
          />
          <OptionRow
            label={t('settings.labels.engineVlc')}
            selected={prefs.preferredEngine === 'vlc'}
            onPress={() => update('preferredEngine', 'vlc')}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.labels.maxQuality')}</Text>
          {BITRATES.map(b => (
            <OptionRow
              key={b.mbps}
              label={b.labelKey ? t(b.labelKey) : b.label ?? ''}
              selected={prefs.maxBitrateMbps === b.mbps}
              onPress={() => update('maxBitrateMbps', b.mbps)}
            />
          ))}
        </View>

        <View style={styles.card}>
          <ToggleRow
            label={t('settings.labels.autoplay')}
            description={t('settings.playback.autoplayNextDesc')}
            value={prefs.autoplayNext}
            onValueChange={v => update('autoplayNext', v)}
          />
        </View>

        <Text style={styles.note}>{t('settings.playback.engineNote')}</Text>

        <Text style={styles.note}>{t('settings.playback.qualityNote')}</Text>
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

function ToggleRow({ label, description, value, onValueChange }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.toggleDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.text, false: colors.surface }}
        thumbColor={colors.bg}
      />
    </View>
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleDesc: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 15 },
  note: { ...type.small, color: colors.textMuted, marginTop: spacing.md, lineHeight: 20 },
});
