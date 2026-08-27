import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { SymbolView } from 'expo-symbols';

import * as Jellyfin from '@/api/jellyfin';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

/** How long the card waits before starting the next episode on its own. */
const COUNTDOWN_SECONDS = 10;

/**
 * What comes after the episode that just finished.
 *
 * Drawn by the screen rather than by either player, over whichever engine is
 * running, so there is one card instead of one per engine.
 *
 * It starts the next episode on its own after ten seconds, which is the point
 * of the thing for a series - but the count is visible and stopping it is a
 * tap anywhere on the card's Close, because auto-advancing on someone who fell
 * asleep is exactly what makes people turn a feature like this off.
 */
export function UpNextCard({ item, onPlay, onDismiss }: {
  item: JellyfinItem;
  onPlay: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);

  // Held in a ref so the countdown depends on the count alone. Taking onPlay
  // as a dependency would restart the timer every time the screen underneath
  // re-rendered and handed down a fresh closure - a clock that resets itself
  // one tick before it ever reaches zero.
  const playRef = useRef(onPlay);
  playRef.current = onPlay;

  useEffect(() => {
    if (remaining <= 0) {
      playRef.current();
      return;
    }
    const id = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const tag = item.ImageTags?.Primary;
  const label = item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${item.ParentIndexNumber} · E${item.IndexNumber}`
    : '';

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Image
          source={{ uri: Jellyfin.imageUrl(item.Id, tag, 'Primary', 400) }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
        />
        <View style={styles.text}>
          <Text style={styles.kicker}>{t('player.upNext')}</Text>
          <Text style={styles.title} numberOfLines={2}>{item.SeriesName ?? item.Name}</Text>
          {label ? <Text style={styles.meta}>{label}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.play}
            onPress={onPlay}
            accessibilityRole="button"
            accessibilityLabel={t('player.playNext')}
          >
            <SymbolView name="play.fill" size={15} tintColor={colors.bg} />
            <Text style={styles.playLabel}>{t('player.playNext')}</Text>
          </Pressable>
          <Pressable
            style={styles.dismiss}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Text style={styles.dismissLabel}>{t('common.close')}</Text>
          </Pressable>
          <Text style={styles.countdown}>{t('player.upNextIn', { seconds: remaining })}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxWidth: 520,
    width: '100%',
  },
  thumb: { width: 120, height: 68, borderRadius: radius.sm, backgroundColor: colors.bg },
  text: { flex: 1, gap: 2 },
  kicker: { ...type.small, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { ...type.body, color: colors.text, fontWeight: '700' },
  meta: { ...type.small, color: colors.textMuted },
  actions: { alignItems: 'flex-end', gap: spacing.sm },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  playLabel: { ...type.small, color: colors.bg, fontWeight: '700' },
  dismiss: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  dismissLabel: { ...type.small, color: colors.textMuted, fontWeight: '600' },
  countdown: { ...type.small, color: colors.textDim },
});
