import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radius, spacing, type } from '@/theme';

/**
 * The rows the player's pickers are made of.
 *
 * They lived inside the item screen, next to the modals that used them. The
 * pickers are sheet routes now, in a file of their own, so the rows move
 * somewhere both can reach.
 */
export function TrackRow({ label, selected, onPress }: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
    >
      {/*
        * The tick leads, in a slot that is there whether or not it is filled.
        *
        * It used to trail the label, which works down a narrow portrait list
        * and falls apart in a wide one: the tick ended up an inch from the
        * name it belonged to, with nothing in between. Leading, every label
        * starts at the same x and the ticked one is read first.
        */}
      <View style={styles.check}>
        {selected ? (
          <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.text} size={17} />
        ) : null}
      </View>
      <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** "Embedded" / "External" above the group of rows it introduces. */
export function SubGroupLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.group}>{children}</Text>;
}

/** One step of subtitle timing: -0.5s, -0.1s, Reset, +0.1s, +0.5s. */
export function DelayButton({ label, disabled, onPress }: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.delayBtn, disabled && styles.delayBtnOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.delayText, disabled && styles.delayTextOff]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Subtitle track names as containers store them: "English - [English]",
 * "Signs - Default". Collapse the repetition and drop the noise.
 */
export function cleanSubLabel(raw: string): string {
  let s = raw ?? '';
  s = s.replace(/\s*-\s*\[([^\]]+)\]/g, (_, inner) => {
    const before = s.split(/\s*-\s*\[/)[0].trim().toLowerCase();
    return before.includes(inner.toLowerCase()) ? '' : ` (${inner})`;
  });
  s = s.replace(/\s*-\s*Default\b/i, '');
  return s.trim();
}

/** The one row every picker shows above the tracks. */
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  /*
   * No rule under each row.
   *
   * A divider per row draws a ladder the eye has to climb, and with two lists
   * side by side it doubles. Selection is carried by the tick and by weight,
   * which is enough - the rows are far enough apart to read as separate.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  check: { width: 26, alignItems: 'flex-start' },
  // Unselected sits back rather than competing: in a list this long, the one
  // you are on should be the only thing at full strength.
  label: { ...type.body, color: colors.textMuted, flex: 1 },
  labelOn: { color: colors.text, fontWeight: '600' },
  group: {
    ...type.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  delayBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  delayBtnOff: { opacity: 0.35 },
  delayText: { ...type.small, color: colors.text, fontWeight: '600' },
  delayTextOff: { color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});
