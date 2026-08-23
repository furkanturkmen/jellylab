import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';

import { getJellyseerrUrl } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, type } from '@/theme';

export default function ContentSettings() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const isAdmin = state.status === 'signed-in' && state.auth.isAdmin;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('profile.menu.content'),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
        }}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.note}>{t('settings.content.note')}</Text>

        {isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings.content.adminHeading')}</Text>
            <TouchableOpacity
              style={styles.linkRow}
              activeOpacity={0.75}
              onPress={() => WebBrowser.openBrowserAsync(`${getJellyseerrUrl()}/settings/main`)}
            >
              <Text style={styles.linkLabel}>{t('settings.content.globalSettings')}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkRow}
              activeOpacity={0.75}
              onPress={() => WebBrowser.openBrowserAsync(`${getJellyseerrUrl()}/users`)}
            >
              <Text style={styles.linkLabel}>{t('settings.content.perUserPermissions')}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.md },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkLabel: { ...type.body, color: colors.text },
  menuArrow: { color: colors.textMuted, fontSize: 20 },
  note: { ...type.small, color: colors.textMuted, lineHeight: 20 },
});
