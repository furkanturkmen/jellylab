import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ContentUnavailableView,
  Host,
  List,
  ProgressView,
  Section,
  SwipeActions,
  Text,
  VStack,
} from '@expo/ui/swift-ui';

import { buttonStyle, scrollContentBackground, tint } from '@expo/ui/swift-ui/modifiers';

import { TabHeader, useTabHeaderMetrics } from '@/components/TabHeader';
import { useDownloads } from '@/hooks/useDownloads';
import { formatBytes } from '@/lib/bytes';
import { loadPrefs } from '@/store/prefs';
import { formatPercent } from '@/lib/percent';
import { cancelDownload, removeDownload, type DownloadEntry } from '@/store/downloads';
import { colors, spacing } from '@/theme';

/**
 * What is on this device.
 *
 * A SwiftUI `List`, so the rows behave the way rows behave everywhere else on
 * the phone: swipe left to delete, full-swipe to skip the aiming, and a real
 * `ProgressView` for what is still arriving. What was here drew its own
 * separators, its own progress bar, and a Delete button you had to hit.
 *
 * Two sections in the order they matter: what is arriving, then what has
 * arrived. Everything is read from disk rather than from the server - that is
 * the point of the tab, and why the store keeps a meta.json beside each file.
 */
export default function DownloadsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { headerHeight } = useTabHeaderMetrics();
  // Lazy useState, not useRef().current: one instance for the life of the
  // screen either way, but this one is not a ref read during render.
  const [scrollY] = useState(() => new Animated.Value(0));
  const { entries, bytes, ready } = useDownloads();
  /**
   * The storage limit, for the readout beside the total.
   *
   * Read once on mount rather than watched: it changes on a settings screen
   * this tab does not own, and a stale number in a footer is worth less than
   * the subscription it would take to keep fresh. 0 means no limit.
   */
  const [capGb, setCapGb] = useState(0);
  useEffect(() => {
    let alive = true;
    loadPrefs()
      .then(p => { if (alive) setCapGb(p.downloadCapGb); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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
      <View style={{ height: headerHeight }} />
      <Host style={styles.list} colorScheme="dark">
        <List modifiers={[scrollContentBackground('hidden'), tint(colors.text)]}>
          {active.length > 0 ? (
            <Section title={t('downloads.arriving')}>
              {active.map(entry => (
                <DownloadRow
                  key={entry.meta.itemId}
                  entry={entry}
                  actionLabel={t('common.cancel')}
                  onAction={() => cancelDownload(entry.meta.itemId)}
                />
              ))}
            </Section>
          ) : null}

          {stored.length > 0 ? (
            <Section
              title={t('downloads.onThisDevice')}
              // The limit is shown beside the total rather than only when it
              // is reached: "4.2 GB" answers nothing on its own, and the first
              // anyone hears of a cap should not be a dialog refusing them.
              footer={(
                <Text>
                  {`${t('downloads.storedCount', { count: stored.length })} · `
                    + (capGb > 0
                      ? t('downloads.capUsage', { used: formatBytes(bytes), cap: `${capGb} GB` })
                      : formatBytes(bytes))}
                </Text>
              )}
            >
              {stored.map(entry => (
                <DownloadRow
                  key={entry.meta.itemId}
                  entry={entry}
                  actionLabel={t('common.delete')}
                  onAction={() => confirmRemove(entry)}
                  onOpen={() => router.push(`/item/${entry.meta.itemId}`)}
                />
              ))}
            </Section>
          ) : null}

          {failed.length > 0 ? (
            <Section title={t('downloads.failed')}>
              {failed.map(entry => (
                <DownloadRow
                  key={entry.meta.itemId}
                  entry={entry}
                  actionLabel={t('common.delete')}
                  onAction={() => removeDownload(entry.meta.itemId)}
                />
              ))}
            </Section>
          ) : null}
        </List>
      </Host>
      <TabHeader title={t('tabs.downloads')} scrollY={scrollY} />
    </View>
  );
}

/**
 * One row: what it is, how it is doing, and a swipe that removes it.
 *
 * The row is a Button when there is somewhere to go, because a list row that
 * navigates is a button on iOS - that is where the highlight and the
 * accessibility come from. A failed or half-arrived download has nowhere to go
 * and stays plain.
 */
function DownloadRow({ entry, actionLabel, onAction, onOpen }: {
  entry: DownloadEntry;
  actionLabel: string;
  onAction: () => void;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const { meta, status, bytesWritten, totalBytes } = entry;
  // -1 means the server sent no Content-Length; a bar that cannot say how far
  // along it is should not pretend, so it spins instead of filling.
  const fraction = totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : null;

  const detail =
    status === 'done' ? formatBytes(totalBytes)
      : status === 'failed' ? (entry.error ?? t('downloads.failed'))
        : fraction != null ? `${formatPercent(fraction)} · ${formatBytes(totalBytes)}`
          : formatBytes(bytesWritten);

  const body = (
    <VStack alignment="leading" spacing={2}>
      <Text>{meta.title}</Text>
      {meta.subtitle ? <Text>{meta.subtitle}</Text> : null}
      <Text>{detail}</Text>
      {status === 'downloading' ? <ProgressView value={fraction} /> : null}
    </VStack>
  );

  return (
    <SwipeActions>
      <SwipeActions.Actions edge="trailing" allowsFullSwipe>
        <Button role="destructive" systemImage="trash" onPress={onAction}>
          <Text>{actionLabel}</Text>
        </Button>
      </SwipeActions.Actions>
      {/* plain, or the whole row draws in the accent colour like a link. */}
      {onOpen ? <Button modifiers={[buttonStyle('plain')]} onPress={onOpen}>{body}</Button> : body}
    </SwipeActions>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 150,
  },
});
