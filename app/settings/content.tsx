import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Button, Form, HStack, Host, Image as UIImage, Label, Section, Spacer, Text } from '@expo/ui/swift-ui';
import { buttonStyle, foregroundColor, scrollContentBackground, tint } from '@expo/ui/swift-ui/modifiers';

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
  const router = useRouter();
  const { state } = useAuth();
  const isAdmin = state.status === 'signed-in' && state.auth.isAdmin;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('profile.menu.content') }} />
      <Host style={styles.host} colorScheme="dark">
        <Form modifiers={[scrollContentBackground('hidden'), tint(colors.text)]}>
          <Section footer={<Text>{t('settings.content.note')}</Text>}>
            {/* A section needs something in it; the paragraph below is the
                whole point of the screen for a non-admin. */}
            <Text>{t('profile.menu.content')}</Text>
          </Section>

          {isAdmin ? (
            <Section title={t('settings.content.adminHeading')}>
              {/* Stays in the app, so it gets a chevron rather than the
                  leaving-the-app arrow below. */}
              <Button
                modifiers={[buttonStyle('plain')]}
                onPress={() => router.push('/settings/filters')}
              >
                <HStack spacing={12}>
                  <Label title={t('profile.menu.contentFilters')} systemImage="line.3.horizontal.decrease.circle" />
                  <Spacer />
                  <UIImage systemName="chevron.right" size={13} modifiers={[foregroundColor(colors.textDim)]} />
                </HStack>
              </Button>
              <Button
                modifiers={[buttonStyle('plain')]}
                onPress={() => WebBrowser.openBrowserAsync(`${getJellyseerrUrl()}/users`)}
              >
                <HStack spacing={12}>
                  <Label title={t('settings.content.perUserPermissions')} systemImage="person.2" />
                  <Spacer />
                  {/* Leaving the app, so the arrow says so rather than a chevron. */}
                  <UIImage
                    systemName="arrow.up.right"
                    size={13}
                    modifiers={[foregroundColor(colors.textDim)]}
                  />
                </HStack>
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
