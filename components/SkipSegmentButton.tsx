import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, spacing, type } from '@/theme';

/**
 * The offer to skip the theme song, or the closing credits.
 *
 * Drawn outside the controls overlay on purpose. The controls fade after three
 * seconds and a theme runs for ninety - a button that fades with them would be
 * gone before the viewer decided, and tapping to bring the controls back is
 * the same effort as waiting the song out.
 *
 * It has no dismiss and no timer of its own. Whether it is on screen is a
 * question about the current position, answered by segmentSkipAt in
 * lib/chapters, so it leaves by itself when the segment ends - or the moment
 * the viewer scrubs out of it.
 */
export const SkipSegmentButton = memo(function SkipSegmentButton({
  segment, onPress,
}: {
  segment: 'intro' | 'credits';
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.label}>
        {t(segment === 'intro' ? 'player.skipIntro' : 'player.skipCredits')}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  /*
   * Bottom right, clear of the scrub row.
   *
   * Where every other client puts it, and the one corner a thumb reaches
   * without crossing the picture.
   */
  button: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 104,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  label: { ...type.bodyStrong, color: colors.text },
});
