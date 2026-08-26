import { useRef } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';

import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { useDownloads } from '@/hooks/useDownloads';
import { formatBytes } from '@/lib/bytes';
import { cancelDownload, removeDownload, type DownloadEntry } from '@/store/downloads';
import { colors, radius, spacing, type } from '@/theme';

/**
 * What is on this device.
 *
 * Two sections in the order they matter: what is arriving, then what has
 * arrived. Everything here is read from disk rather than from the server -
 * that is the point of the tab, and it is why the store keeps a meta.json
 * beside each file.
 */
export default function DownloadsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { headerHeight } = useTabHeaderMetrics();
  const scrollY = useRef(new Animated.Value(0)).current;
  const { entries, bytes, ready } = useDownloads();

  const active = entries.filter(e => e.status === 'downloading' || e.status === 'queued');
  const stored = entries.filter(e => e.status === 'done');
  const failed = entries.filter(e => e.status === 'failed');

  function confirmRemove(entry: DownloadEntry) {
    Alert.alert(
      t('downloads.removeTitle'),
      t('downloads.removeBody', { title: entry.meta.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => removeDownload(entry.meta.itemId) },
      ],
    );
  }

  if (!ready) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.center}><ActivityIndicator color={colors.text} /></View>
        <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={{ height: headerHeight }} />
        {/*
          * The system's own empty state.
          *
          * What was here was a circle, an icon, a title and a paragraph, sized
          * and spaced by eye to look like the one iOS draws. This is that one.
          */}
        <Host style={styles.center} colorScheme="dark">
          <ContentUnavailableView
            title={t('downloads.emptyTitle')}
            systemImage="arrow.down.circle"
            description={t('downloads.emptyBody')}
          />
        </Host>
        <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        <View style={{ height: headerHeight }} />

        <Text style={styles.total}>
          {t('downloads.storedCount', { count: stored.length })} · {formatBytes(bytes)}
        </Text>

        {active.length > 0 ? (
          <Section title={t('downloads.arriving')}>
            {active.map(entry => (
              <Row
                key={entry.meta.itemId}
                entry={entry}
                action={t('common.cancel')}
                onAction={() => cancelDownload(entry.meta.itemId)}
              />
            ))}
          </Section>
        ) : null}

        {stored.length > 0 ? (
          <Section title={t('downloads.onThisDevice')}>
            {stored.map(entry => (
              <Row
                key={entry.meta.itemId}
                entry={entry}
                action={t('common.delete')}
                destructive
                onAction={() => confirmRemove(entry)}
                onPress={() => router.push(`/item/${entry.meta.itemId}`)}
              />
            ))}
          </Section>
        ) : null}

        {failed.length > 0 ? (
          <Section title={t('downloads.failed')}>
            {failed.map(entry => (
              <Row
                key={entry.meta.itemId}
                entry={entry}
                action={t('common.delete')}
                destructive
                onAction={() => removeDownload(entry.meta.itemId)}
              />
            ))}
          </Section>
        ) : null}
      </Animated.ScrollView>
      <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ entry, action, destructive, onAction, onPress }: {
  entry: DownloadEntry;
  action: string;
  destructive?: boolean;
  onAction: () => void;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const { meta, status, bytesWritten, totalBytes } = entry;
  // -1 means the server sent no Content-Length, and a bar that cannot say how
  // far along it is should not pretend.
  const progress = totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : null;

  const detail =
    status === 'done' ? formatBytes(totalBytes)
      : status === 'failed' ? (entry.error ?? t('downloads.failed'))
        : progress != null ? `${Math.round(progress * 100)}% · ${formatBytes(totalBytes)}`
          : formatBytes(bytesWritten);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{meta.title}</Text>
        {meta.subtitle ? <Text style={styles.rowMeta} numberOfLines={1}>{meta.subtitle}</Text> : null}
        <Text style={styles.rowDetail}>{detail}</Text>
        {status === 'downloading' && progress != null ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={onAction}
        style={styles.action}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${meta.title}`}
      >
        <Text style={[styles.actionText, destructive && styles.actionDestructive]}>{action}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
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

  total: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: { ...type.h2, color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textMuted },
  rowDetail: { ...type.caption, color: colors.textDim },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { ...type.caption, color: colors.text, textTransform: 'uppercase' },
  actionDestructive: { color: 'rgba(255, 99, 99, 1)' },
});
