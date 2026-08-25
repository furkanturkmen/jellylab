import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

const BITRATES: { mbps: number; label: string }[] = [
  { mbps: 0, label: 'Original quality' },
  { mbps: 8, label: '8 Mbps' },
  { mbps: 4, label: '4 Mbps' },
  { mbps: 2, label: '2 Mbps' },
  { mbps: 1, label: '1 Mbps' },
];

const AUDIO: { code: string; label: string }[] = [
  { code: 'original', label: 'Original' },
  { code: 'eng', label: 'English' },
  { code: 'nld', label: 'Dutch' },
  { code: 'tur', label: 'Turkish' },
  { code: 'ger', label: 'German' },
  { code: 'jpn', label: 'Japanese' },
];

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
      <Stack.Screen options={{ title: 'Playback', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.labels.preferredAudio')}</Text>
          {AUDIO.map(a => (
            <OptionRow
              key={a.code}
              label={a.label}
              selected={prefs.audioLanguage === a.code}
              onPress={() => update('audioLanguage', a.code)}
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
              label={b.label}
              selected={prefs.maxBitrateMbps === b.mbps}
              onPress={() => update('maxBitrateMbps', b.mbps)}
            />
          ))}
        </View>

        <View style={styles.card}>
          <ToggleRow
            label={t('settings.labels.autoplay')}
            description="Automatically play the next episode of a TV show when the current one ends."
            value={prefs.autoplayNext}
            onValueChange={v => update('autoplayNext', v)}
          />
        </View>

        <Text style={styles.note}>
          Auto picks AVPlayer when the file’s container/codec is supported and
          falls back to VLC otherwise. Force AVPlayer if you always want the
          native iOS player; force VLC for maximum compatibility (MKV, DTS,
          TrueHD, VP9, AV1) at the cost of slower startup.
        </Text>

        <Text style={styles.note}>
          Original quality streams the file untouched — best picture, no work
          for the server, but needs a connection fast enough for the source
          bitrate. Picking a limit makes the server transcode anything above it,
          which is what you want on cellular. Files already under the limit are
          streamed untouched either way.
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
