import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Form, Host, Picker, Section, Text } from '@expo/ui/swift-ui';
import { tag } from '@expo/ui/swift-ui/modifiers';

import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors } from '@/theme';

/**
 * Subtitles, drawn by SwiftUI - see settings/playback.tsx for the reasoning
 * and for the tag contract these pickers depend on.
 */

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
      <Stack.Screen options={{ title: t('nav.subtitles') }} />
      <Host style={styles.host} colorScheme="dark">
        <Form>
          <Section title={t('settings.labels.preferredSubs')}>
            <Picker
              label={t('settings.labels.preferredSubs')}
              selection={prefs.subtitleLanguage}
              onSelectionChange={code => { if (code) update('subtitleLanguage', String(code)); }}
            >
              {LANGS.map(code => (
                <Text key={code} modifiers={[tag(code)]}>{t(`trackLanguages.${code}`)}</Text>
              ))}
            </Picker>
          </Section>

          <Section title={t('settings.labels.textSize')} footer={<Text>{t('settings.subtitles.note')}</Text>}>
            <Picker
              label={t('settings.labels.textSize')}
              selection={prefs.subtitleSize}
              onSelectionChange={size => {
                if (size) update('subtitleSize', String(size) as Prefs['subtitleSize']);
              }}
            >
              {SIZES.map(size => (
                <Text key={size} modifiers={[tag(size)]}>{t(`settings.subtitles.size.${size}`)}</Text>
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
