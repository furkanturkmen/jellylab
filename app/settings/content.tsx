import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Button, Form, HStack, Host, Image as UIImage, Label, Section, Spacer, Text, Toggle } from '@expo/ui/swift-ui';
import { buttonStyle, foregroundColor, scrollContentBackground, tint } from '@expo/ui/swift-ui/modifiers';

import * as Jellyseerr from '@/api/jellyseerr';
import { getJellyseerrUrl } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/theme';

/**
 * Content settings: the account's own adult filter, and a way out to
 * Jellyseerr for an admin.
 *
 * The switch is not a device preference and deliberately so. It is stored on
 * the Jellyseerr account, which is the one place that decides what anybody is
 * shown - so it holds in the app, on the Jellyseerr website, and in the
 * Jellyfin library, rather than only on the phone it was flipped on. An
 * earlier device-only version of this switch is what that replaces.
 *
 * What an administrator hides from someone is a separate thing and is not
 * shown here at all: it is not this account's to change, and offering a
 * control that silently refuses to move would be worse than offering none.
 */
export default function ContentSettings() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const isAdmin = state.status === 'signed-in' && state.auth.isAdmin;

  // null until Jellyseerr has answered - the switch is not drawn before then,
  // because a switch that starts off and then jumps reads as having been
  // changed by the act of opening the screen.
  const [hideAdult, setHideAdult] = useState<boolean | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const settings = await Jellyseerr.myContentSettings();
        if (alive && settings) setHideAdult(settings.hideAdult);
      } catch {
        // Unreachable server: leave the switch undrawn rather than guessing at
        // a state. The paragraph above it still explains where this lives.
      }
    })();
    return () => { alive = false; };
  }, []);

  const onChange = useCallback(async (next: boolean) => {
    if (saving.current) return;
    saving.current = true;
    // Moved first so the switch follows the finger, and put back below if the
    // server would not have it.
    setHideAdult(next);
    try {
      const keywordIds = await Jellyseerr.setHideAdult(next);
      /*
       * Discover asks TMDB to leave these out, so the exclusions have to move
       * with the switch. Without this the server would still hide the titles -
       * it is the enforcement - but every browse row would arrive with holes
       * in it until the next sign-in refreshed the list.
       */
      Jellyseerr.setContentExclusions({ keywordIds, genreIds: [], certificationLte: null });
      console.log(`[jellylab] hideAdult=${next}, hidden keywords: ${keywordIds.length}`);
    } catch (e) {
      setHideAdult(!next);
      console.log(`[jellylab] could not save hideAdult: ${String(e)}`);
      Alert.alert(t('settings.content.hideAdultFailedTitle'), t('settings.content.hideAdultFailed'));
    } finally {
      saving.current = false;
    }
  }, [t]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('profile.menu.content') }} />
      <Host style={styles.host} colorScheme="dark">
        <Form modifiers={[scrollContentBackground('hidden'), tint(colors.text)]}>
          <Section footer={<Text>{t('settings.content.note')}</Text>}>
            {hideAdult === null ? (
              // A section needs something in it, and this is also what the
              // screen says while the server has not answered.
              <Text>{t('profile.menu.content')}</Text>
            ) : (
              <Toggle
                label={t('settings.content.hideAdult')}
                isOn={hideAdult}
                onIsOnChange={onChange}
              />
            )}
          </Section>

          {isAdmin ? (
            <Section title={t('settings.content.adminHeading')}>
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
