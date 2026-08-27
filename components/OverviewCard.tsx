import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, type } from '@/theme';

/**
 * The synopsis on an item's page, with its show more / show less.
 *
 * Out of the item screen with the rest of the pieces that never reached back
 * into it: this one takes a string and a flag.
 */

/**
 * The description, clamped on a series.
 *
 * On a film this is the last thing on the screen, so its length costs nothing.
 * On a series the episode list is underneath it, and that list is what you came
 * for - and these descriptions are long: AniDB writes four paragraphs plus a
 * source note, which pushed episode one about two screens down.
 *
 * Three lines and a tap, the way Apple TV and Netflix handle the same problem:
 * enough to decide whether to watch, without standing between you and the
 * thing you meant to play.
 */
export function OverviewCard({ text, clamp }: { text: string; clamp: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Only worth a control when there is more to see. Three lines is roughly 180
  // characters at this width; below that the tap would do nothing visible.
  const clamped = clamp && !expanded && text.length > 180;

  return (
    <TouchableOpacity
      style={styles.overviewCard}
      activeOpacity={clamp ? 0.8 : 1}
      onPress={clamp ? () => setExpanded(v => !v) : undefined}
      accessibilityRole={clamp ? 'button' : undefined}
      accessibilityLabel={clamp ? t(expanded ? 'detail.showLess' : 'detail.showMore') : undefined}
    >
      <Text style={styles.sectionLabel}>{t('detail.overview')}</Text>
      <Text style={styles.overview} numberOfLines={clamped ? 3 : undefined}>{text}</Text>
      {clamp && text.length > 180 ? (
        <Text style={styles.overviewMore}>{t(expanded ? 'detail.showLess' : 'detail.showMore')}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overviewCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  overview: { ...type.body, color: colors.text, lineHeight: 22 },
  overviewMore: { ...type.small, color: colors.textMuted, marginTop: spacing.sm, fontWeight: '600' },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
});
