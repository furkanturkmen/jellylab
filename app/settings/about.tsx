import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { APP_BUILD_LABEL, getJellyfinUrl } from '@/config';
import { colors, radius, spacing, type } from '@/theme';

const REPO = 'https://github.com/furkanturkmen/jellylab';

/**
 * What this build is, and what it is talking to.
 *
 * Written for the moment something misbehaves on a phone that is not in front
 * of you: the app version and build, and the server's name and version, in one
 * place that can be read aloud.
 */
export default function AboutSettings() {
  const { t } = useTranslation();
  const [server, setServer] = useState<{ name?: string; version?: string } | null>(null);

  useEffect(() => {
    // Public endpoint - it answers before sign-in and needs no token, so this
    // screen still says something useful when auth is the thing that is broken.
    Jellyfin.getPublicSystemInfo()
      .then(info => setServer({ name: info?.ServerName, version: info?.Version }))
      .catch(() => setServer(null));
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('settings.about.title'),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
        }}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={require('@/brand/png/icon/icon-180.png')} style={styles.mark} />
          <Text style={styles.name}>JellyLab</Text>
          <Text style={styles.version}>{APP_BUILD_LABEL}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.about.connectedTo')}</Text>
          <Field label={t('settings.about.server')} value={server?.name ?? '—'} />
          <Field label={t('settings.about.serverVersion')} value={server?.version ?? '—'} />
          <Field label={t('settings.about.address')} value={getJellyfinUrl().replace(/^https?:\/\//, '') || '—'} />
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.linkRow} activeOpacity={0.75} onPress={() => WebBrowser.openBrowserAsync(REPO)}>
            <Text style={styles.linkLabel}>{t('settings.about.source')}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.75}
            onPress={() => WebBrowser.openBrowserAsync(`${REPO}/blob/main/CHANGELOG.md`)}
          >
            <Text style={styles.linkLabel}>{t('settings.about.changes')}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Required wording: TMDB ask that anything using their data says this,
            and this app draws its heroes and posters from it. */}
        <Text style={styles.credit}>{t('settings.about.tmdbCredit')}</Text>
      </ScrollView>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  mark: { width: 72, height: 72, borderRadius: radius.lg },
  name: { ...type.h1, color: colors.text, marginTop: spacing.md },
  version: { ...type.small, color: colors.textMuted, marginTop: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardLabel: {
    ...type.caption,
    color: colors.textDim,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  fieldLabel: { ...type.body, color: colors.textMuted },
  fieldValue: { ...type.body, color: colors.text, flexShrink: 1, textAlign: 'right' },

  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  linkLabel: { ...type.body, color: colors.text },
  arrow: { color: colors.textDim, fontSize: 20 },

  credit: { ...type.caption, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
