import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Jellyfin from '@/api/jellyfin';
import { colors, radius, spacing, type } from '@/theme';
import type { JellyfinItem } from '@/types';

/** How long the card waits before starting the next episode on its own. */
const COUNTDOWN_MS = 10_000;

/**
 * What comes after the episode that just finished.
 *
 * Sits at the bottom over the last frame rather than in the middle of a dimmed
 * screen: the film is what you were watching, and a panel that blacks it out
 * to announce the next one is the wrong weight for something you might well
 * dismiss. Only a gradient under the card does the work of keeping the text
 * legible over whatever frame it landed on.
 *
 * The material is the system's own glass where the OS has it, and a dark blur
 * where it does not, so this reads as part of iOS rather than as a grey box
 * drawn on top of it.
 *
 * The wait is a line that fills rather than a number counting down. It says
 * the same thing without asking to be read, and it is the same language the
 * download button already speaks elsewhere in the app.
 */
export function UpNextCard({ item, onPlay, onDismiss }: {
  item: JellyfinItem;
  onPlay: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [remaining, setRemaining] = useState(Math.round(COUNTDOWN_MS / 1000));
  // Created once, by the initialiser rather than a ref, so nothing is read
  // out of a ref while rendering.
  const [progress] = useState(() => new Animated.Value(0));

  // Held in a ref so the countdown depends on nothing that re-renders. Taking
  // onPlay as a dependency would restart the run every time the screen
  // underneath handed down a fresh closure - a clock that resets itself one
  // tick before it ever reaches zero.
  const playRef = useRef(onPlay);
  useEffect(() => { playRef.current = onPlay; }, [onPlay]);

  useEffect(() => {
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: COUNTDOWN_MS,
      easing: Easing.linear,
      // Width cannot be driven natively; the bar is one small view and this is
      // the only animation on screen.
      useNativeDriver: false,
    });
    run.start(({ finished }) => { if (finished) playRef.current(); });

    // Only so the countdown can be spoken; nothing on screen shows the number.
    const tick = setInterval(() => setRemaining(r => (r > 0 ? r - 1 : 0)), 1000);
    return () => { run.stop(); clearInterval(tick); };
  }, [progress]);

  const tag = item.ImageTags?.Primary;
  const label = item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${item.ParentIndexNumber} · E${item.IndexNumber}`
    : '';

  const body = (
    <View style={styles.row}>
      <Image
        source={{ uri: Jellyfin.imageUrl(item.Id, tag, 'Primary', 400) }}
        style={styles.thumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.text}>
        <Text style={styles.kicker}>{t('player.upNext')}</Text>
        <Text style={styles.title} numberOfLines={1}>{item.SeriesName ?? item.Name}</Text>
        {label ? <Text style={styles.meta} numberOfLines={1}>{label}</Text> : null}
      </View>
      <Pressable
        onPress={onDismiss}
        style={styles.dismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Text style={styles.dismissLabel}>{t('common.close')}</Text>
      </Pressable>
      <Pressable
        onPress={onPlay}
        style={styles.play}
        accessibilityRole="button"
        accessibilityLabel={t('player.upNextIn', { seconds: remaining })}
      >
        <SymbolView name="play.fill" size={14} tintColor={colors.bg} />
        <Text style={styles.playLabel}>{t('player.playNext')}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} pointerEvents="box-none">
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {isLiquidGlassAvailable() ? (
        <GlassView style={styles.card} glassEffectStyle="regular" colorScheme="dark">
          {body}
          <Fill progress={progress} />
        </GlassView>
      ) : (
        <BlurView tint="dark" intensity={40} style={[styles.card, styles.blurCard]}>
          {body}
          <Fill progress={progress} />
        </BlurView>
      )}
    </View>
  );
}

/** The wait, as a line across the foot of the card. */
function Fill({ progress }: { progress: Animated.Value }) {
  return (
    <View style={styles.fillTrack} pointerEvents="none">
      <Animated.View
        style={[
          styles.fill,
          { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // 16pt is the system's own side margin in a compact width; the card lines
    // up with everything else that sits against an edge.
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
  },
  card: {
    borderRadius: 26,
    // iOS corners are a continuous curve, not a circular arc. At this radius
    // the difference is the whole difference between "rounded rectangle" and
    // "an iOS surface".
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 620,
  },
  // The blur fallback has no material edge of its own, so it is given one.
  blurCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassTint,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  thumb: {
    // 16:9, the shape of the thing it is a picture of.
    width: 112,
    height: 63,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.bg,
  },
  text: { flex: 1, gap: 1, minWidth: 0 },
  kicker: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase' },
  // 17pt semibold is the system's emphasised body - the size a row title is
  // set at throughout iOS.
  title: { fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  meta: { ...type.small, color: colors.textMuted },
  // 44pt is the minimum a finger is expected to find. Both of these were
  // shorter than that before, which is the sort of thing that reads as
  // "cheap" without being nameable.
  dismiss: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  dismissLabel: { ...type.small, color: colors.textMuted, fontWeight: '600' },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  playLabel: { fontSize: 15, fontWeight: '600', color: colors.bg },
  fillTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fill: { height: '100%', backgroundColor: colors.text },
});
