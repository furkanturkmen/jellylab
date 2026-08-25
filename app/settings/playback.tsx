import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Form, Host, Picker, Section, Text, Toggle } from '@expo/ui/swift-ui';

import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors } from '@/theme';

/**
 * The first screen drawn by iOS rather than by us.
 *
 * What was here was a hand-built grouped list: rounded cards, rows with a tick
 * on the selected one, a React Native Switch, and spacing chosen by eye to look
 * like Settings.app. It looked close. It was not the same thing - it did not
 * grow with Dynamic Type, VoiceOver read it as a pile of buttons rather than a
 * form, and every iOS release was another chance for the resemblance to slip.
 *
 * `@expo/ui` renders actual SwiftUI, so this is a real `Form` with real
 * `Section`s, `Picker`s and a `Toggle`. Everything below is the same
 * preferences file as before; only the drawing changed.
 *
 * Note the shape: SwiftUI views have to live under a `Host`, which is the
 * bridge between the React tree and the SwiftUI one. A Host that fills the
 * screen gives the form its own scrolling, as Settings.app has.
 */

const BITRATES: { mbps: number; label?: string; labelKey?: string }[] = [
  { mbps: 0, labelKey: 'settings.labels.originalQuality' },
  { mbps: 8, label: '8 Mbps' },
  { mbps: 4, label: '4 Mbps' },
  { mbps: 2, label: '2 Mbps' },
  { mbps: 1, label: '1 Mbps' },
];

const AUDIO = ['original', 'eng', 'nld', 'tur', 'ger', 'jpn'];

const ENGINES: Prefs['preferredEngine'][] = ['auto', 'native', 'vlc'];

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

  const engineLabels = [
    t('settings.labels.engineAuto'),
    t('settings.labels.engineNative'),
    t('settings.labels.engineVlc'),
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('nav.playback') }} />
      {/* The app is dark whatever the phone is set to, so SwiftUI is told
          rather than left to ask the system. */}
      <Host style={styles.host} colorScheme="dark">
        <Form>
          <Section title={t('settings.labels.preferredAudio')}>
            {/* Pickers take their options as children and report the index
                back, so the code that reads them stays the same. */}
            <Picker
              label={t('settings.labels.preferredAudio')}
              selection={AUDIO.indexOf(prefs.audioLanguage)}
              onSelectionChange={index => update('audioLanguage', AUDIO[index as number] ?? 'original')}
            >
              {AUDIO.map(code => <Text key={code}>{t(`trackLanguages.${code}`)}</Text>)}
            </Picker>
          </Section>

          <Section title={t('settings.labels.engine')} footer={<Text>{t('settings.playback.engineNote')}</Text>}>
            <Picker
              label={t('settings.labels.engine')}
              selection={ENGINES.indexOf(prefs.preferredEngine)}
              onSelectionChange={index => update('preferredEngine', ENGINES[index as number] ?? 'auto')}
            >
              {engineLabels.map(label => <Text key={label}>{label}</Text>)}
            </Picker>
          </Section>

          <Section title={t('settings.labels.maxQuality')} footer={<Text>{t('settings.playback.qualityNote')}</Text>}>
            <Picker
              label={t('settings.labels.maxQuality')}
              selection={BITRATES.findIndex(b => b.mbps === prefs.maxBitrateMbps)}
              onSelectionChange={index => update('maxBitrateMbps', BITRATES[index as number]?.mbps ?? 0)}
            >
              {BITRATES.map(b => (
                <Text key={b.mbps}>{b.labelKey ? t(b.labelKey) : b.label ?? ''}</Text>
              ))}
            </Picker>
          </Section>

          <Section footer={<Text>{t('settings.playback.autoplayNextDesc')}</Text>}>
            <Toggle
              label={t('settings.labels.autoplay')}
              isOn={prefs.autoplayNext}
              onIsOnChange={value => update('autoplayNext', value)}
            />
          </Section>
        </Form>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  host: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
