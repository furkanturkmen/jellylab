import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Form, Host, Picker, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { scrollContentBackground, tag, tint } from '@expo/ui/swift-ui/modifiers';

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
 *
 * Every option carries a `tag`, and `selection` is a tag rather than an index.
 * That is SwiftUI's own contract and it is not optional: written with indices,
 * the picker matched nothing, handed back nothing on selection, and every
 * choice fell through to the default - which read as the screen resetting
 * itself and as the quality setting refusing to change.
 */

/**
 * Named by what you get, not by megabits.
 *
 * "8 Mbps" means nothing to anyone who has not thought about bitrates; "Full
 * HD (uses more data)" is the same choice, described.
 */
const BITRATES: { mbps: number; labelKey: string }[] = [
  { mbps: 0, labelKey: 'settings.labels.originalQuality' },
  { mbps: 8, labelKey: 'settings.labels.quality8' },
  { mbps: 4, labelKey: 'settings.labels.quality4' },
  { mbps: 2, labelKey: 'settings.labels.quality2' },
  { mbps: 1, labelKey: 'settings.labels.quality1' },
];

/**
 * How much room downloads may take, in gigabytes.
 *
 * The spread is chosen against what this library actually holds: a film runs
 * to a median of 2.25GB and a twelve-episode season to about 3.9GB, so 20GB
 * is roughly eight films or five seasons and 5GB is a single season with room
 * to spare. Zero turns the cap off, for a phone with space to burn.
 */
const CAPS = [0, 5, 10, 20, 50, 100];

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
        <Form modifiers={[scrollContentBackground('hidden'), tint(colors.text)]}>
          <Section title={t('settings.labels.preferredAudio')}>
            {/* The tag is the value the preferences file stores, so what comes
                back needs no translating between the two. */}
            <Picker
              label={t('settings.labels.preferredAudio')}
              selection={prefs.audioLanguage}
              onSelectionChange={code => { if (code) update('audioLanguage', String(code)); }}
            >
              {AUDIO.map(code => (
                <Text key={code} modifiers={[tag(code)]}>{t(`trackLanguages.${code}`)}</Text>
              ))}
            </Picker>
          </Section>

          <Section title={t('settings.labels.engine')} footer={<Text>{t('settings.playback.engineNote')}</Text>}>
            <Picker
              label={t('settings.labels.engine')}
              selection={prefs.preferredEngine}
              onSelectionChange={engine => {
                if (engine) update('preferredEngine', String(engine) as Prefs['preferredEngine']);
              }}
            >
              {ENGINES.map((engine, i) => (
                <Text key={engine} modifiers={[tag(engine)]}>{engineLabels[i]}</Text>
              ))}
            </Picker>
          </Section>

          <Section title={t('settings.labels.maxQuality')} footer={<Text>{t('settings.playback.qualityNote')}</Text>}>
            <Picker
              label={t('settings.labels.maxQuality')}
              selection={prefs.maxBitrateMbps}
              onSelectionChange={mbps => { if (mbps != null) update('maxBitrateMbps', Number(mbps)); }}
            >
              {BITRATES.map(b => (
                <Text key={b.mbps} modifiers={[tag(b.mbps)]}>{t(b.labelKey)}</Text>
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

          <Section title={t('downloads.capLimit')} footer={<Text>{t('downloads.capLimitBody')}</Text>}>
            <Picker
              label={t('downloads.capLimit')}
              selection={prefs.downloadCapGb}
              onSelectionChange={gb => { if (gb != null) update('downloadCapGb', Number(gb)); }}
            >
              {CAPS.map(gb => (
                <Text key={gb} modifiers={[tag(gb)]}>
                  {gb === 0 ? t('downloads.capOff') : `${gb} GB`}
                </Text>
              ))}
            </Picker>
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
