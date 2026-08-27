import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TrackRow } from '@/components/TrackRow';
import { clearPlayerSheet, pendingPlayerSheet } from '@/store/playerSheet';
import { HAS_LIQUID_GLASS } from '@/lib/device';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The player's speed picker.
 *
 * Audio and subtitles were here too, as a formSheet route. Pushing one took
 * the player off screen to answer a question about the film that was playing,
 * and UIKit drew the card on a background of its own - so the glass had
 * nothing to be glass over and read as flat grey. They are drawn over the film
 * now; see components/TrackPicker.
 *
 * Speed stayed. It is five rows, it is asked for rarely, and a small card is
 * the right shape for it.
 */
export default function PlayerSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Read once. The player writes before it pushes, and a later write is a
  // different opening of the sheet.
  const request = useMemo(() => pendingPlayerSheet(), []);

  useEffect(() => {
    if (!request) router.back();
    return () => clearPlayerSheet();
  }, [request, router]);

  if (!request) return null;

  /*
   * The scroller is the sheet itself - see the seasons sheet for why. Padding
   * rides on the content so the card is measured from what it holds, and comes
   * from the safe-area insets because this can open in landscape, which is
   * where the Dynamic Island sits on a long edge.
   */
  const pad = [
    styles.content,
    {
      paddingBottom: Math.max(insets.bottom, spacing.lg),
      paddingLeft: Math.max(insets.left, spacing.lg),
      paddingRight: Math.max(insets.right, spacing.lg),
    },
  ];

  const body = (
    <>
      <Text style={styles.title}>{t('player.speed')}</Text>
      {request.rates.map(rate => (
        <TrackRow
          key={rate}
          label={`${rate}x${rate === 1 ? ` (${t('player.speedNormal')})` : ''}`}
          selected={Math.abs(request.current - rate) < 0.01}
          onPress={() => { request.onPick(rate); router.back(); }}
        />
      ))}
    </>
  );

  return (
    <ScrollView
      style={HAS_LIQUID_GLASS ? styles.rootGlass : styles.root}
      contentContainerStyle={pad}
      showsVerticalScrollIndicator={false}
    >
      {HAS_LIQUID_GLASS ? (
        <GlassView style={styles.card} glassEffectStyle="clear" colorScheme="dark">{body}</GlassView>
      ) : (
        <View style={[styles.card, styles.cardSolid]}>{body}</View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No corners and no handle: the sheet around this draws both.
  // No flex, for the same reason as the seasons sheet: the card is measured
  // from this view, and flex would make it report the whole screen.
  root: { backgroundColor: colors.bgElevated },
  // With glass the card carries the surface, so the sheet behind it has to let
  // what is underneath through. Paired with the transparent contentStyle on
  // the route.
  rootGlass: { backgroundColor: 'transparent' },
  content: { paddingTop: spacing.xl },
  card: {
    width: '100%',
    // A reading column rather than the width of a phone held sideways.
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    overflow: 'hidden',
  },
  // Only when there is no glass to carry it.
  cardSolid: { backgroundColor: colors.glassTint },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.md },
});
