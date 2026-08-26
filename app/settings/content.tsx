import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Button, Form, Host, Section, Text } from '@expo/ui/swift-ui';

import { getJellyseerrUrl } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/theme';

/**
 * Content settings: a paragraph and, for an admin, a way out to Jellyseerr.
 *
 * Drawn by SwiftUI like the rest of Settings now. The row that leaves the app
 * is a `Button` with a chevron rather than a Text and a drawn "›" - the
 * disclosure, the press state and the alignment are the system's.
 */
export default function ContentSettings() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const isAdmin = state.status === 'signed-in' && state.auth.isAdmin;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('profile.menu.content') }} />
      <Host style={styles.host} colorScheme="dark">
        <Form>
          <Section footer={<Text>{t('settings.content.note')}</Text>}>
            {/* A section needs something in it; the paragraph below is the
                whole point of the screen for a non-admin. */}
            <Text>{t('profile.menu.content')}</Text>
          </Section>

          {isAdmin ? (
            <Section title={t('settings.content.adminHeading')}>
              <Button
                systemImage="person.2"
                onPress={() => WebBrowser.openBrowserAsync(`${getJellyseerrUrl()}/users`)}
              >
                <Text>{t('settings.content.perUserPermissions')}</Text>
              </Button>
            </Section>
          ) : null}
        </Form>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  host: { flex: 1 },
});
