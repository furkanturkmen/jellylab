import { useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { colors, radius, spacing, type } from '@/theme';

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const { headerHeight } = useTabHeaderMetrics();
  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={{ height: headerHeight }} />
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <SymbolView
            name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }}
            tintColor={colors.textMuted}
            size={56}
          />
        </View>
        <Text style={styles.title}>{t('downloads.emptyTitle')}</Text>
        <Text style={styles.body}>{t('downloads.emptyBody')}</Text>
      </View>
      <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 150,
  },
  iconWrap: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
