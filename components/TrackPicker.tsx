import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { DelayButton, SubGroupLabel, TrackRow } from '@/components/TrackRow';
import { HAS_LIQUID_GLASS } from '@/lib/device';
import { colors, spacing, type } from '@/theme';

/**
 * The audio and subtitle picker, drawn over the film rather than beside it.
 *
 * It was a formSheet route: pushing it took the player off screen, UIKit drew
 * a card on a background of its own, and the glass had nothing to be glass
 * over - it sampled the sheet's own backdrop and read as flat grey. It also
 * meant navigating away from a playing film to answer a question about it.
 *
 * Drawn here it is just another layer of the player, like the play button. The
 * film keeps running underneath and the glass has something to show through,
 * which is the whole point of glass.
 */

/** One line in either column. The engines differ; a row does not. */
export type PickerRow = {
  key: string;
  label: string;
  selected: boolean;
  onPick: () => void;
  /** Drawn above this row - "Embedded", "External". */
  group?: string;
};

export type TrackPickerProps = {
  onClose: () => void;
  audio: PickerRow[];
  subtitles: PickerRow[];
  /** Said under the audio column when the server is sending fewer tracks than it has. */
  audioNote?: string | null;
  /** Absent for the engine that has no subtitle overlay to shift. */
  timing?: {
    delayMs: number;
    enabled: boolean;
    onChange: (ms: number) => void;
  } | null;
};

export function TrackPicker({ onClose, audio, subtitles, audioNote, timing }: TrackPickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/*
        * Clear rather than regular. Regular is most of the way to opaque, and
        * over a dark film it reads as the flat grey card this replaced - the
        * film is the thing that makes it look like glass, so let it through.
        */}
      {HAS_LIQUID_GLASS ? (
        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="clear" colorScheme="dark" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {/* Anywhere off the lists closes it, the way tapping beside a sheet did. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />

      <View
        style={[
          styles.frame,
          {
            paddingTop: Math.max(insets.top, spacing.lg),
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            paddingLeft: Math.max(insets.left, spacing.xl),
            paddingRight: Math.max(insets.right, spacing.xl),
          },
        ]}
        // The frame sits over the dismiss layer, so presses inside the lists
        // do not fall through to it.
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.close}
          onPress={onClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={colors.text} size={22} />
        </TouchableOpacity>

        <View style={styles.columns}>
          <Column title={t('player.audio')} rows={audio} empty={t('player.noAudio')} note={audioNote} />
          <Column title={t('player.subtitles')} rows={subtitles} empty={t('player.noSubtitles')} />
        </View>

        {timing ? <Timing timing={timing} /> : null}
      </View>
    </View>
  );
}

function Column({ title, rows, empty, note }: {
  title: string;
  rows: PickerRow[];
  empty: string;
  note?: string | null;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.title}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        // Each column scrolls on its own: a file with nine subtitle tracks and
        // one audio track should not make the audio column scroll too.
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map(row => (
            <Fragment key={row.key}>
              {row.group ? <SubGroupLabel>{row.group}</SubGroupLabel> : null}
              <TrackRow label={row.label} selected={row.selected} onPress={row.onPick} />
            </Fragment>
          ))}
        </ScrollView>
      )}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/**
 * Subtitle timing, across the foot of both columns.
 *
 * It belongs to the subtitles but not to their column: five small buttons
 * squeezed into half the width stop being hittable.
 */
function Timing({ timing }: { timing: NonNullable<TrackPickerProps['timing']> }) {
  const { t } = useTranslation();
  const { delayMs, enabled, onChange } = timing;
  return (
    <View style={styles.timing}>
      <View style={styles.timingHeader}>
        <Text style={styles.timingLabel}>{t('player.timing')}</Text>
        <Text style={styles.timingValue}>
          {delayMs === 0 ? t('player.inSync') : `${delayMs > 0 ? '+' : ''}${(delayMs / 1000).toFixed(1)}s`}
        </Text>
      </View>
      <View style={styles.timingRow}>
        <DelayButton label="-0.5s" disabled={!enabled} onPress={() => onChange(delayMs - 500)} />
        <DelayButton label="-0.1s" disabled={!enabled} onPress={() => onChange(delayMs - 100)} />
        <DelayButton label={t('player.reset')} disabled={!enabled || delayMs === 0} onPress={() => onChange(0)} />
        <DelayButton label="+0.1s" disabled={!enabled} onPress={() => onChange(delayMs + 100)} />
        <DelayButton label="+0.5s" disabled={!enabled} onPress={() => onChange(delayMs + 500)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Where there is no liquid glass to draw, something still has to make the
  // text readable over a moving picture.
  fallback: { backgroundColor: 'rgba(10, 10, 12, 0.82)' },
  frame: { flex: 1 },
  close: { position: 'absolute', top: spacing.lg, right: spacing.lg, zIndex: 2, padding: spacing.xs },
  columns: { flex: 1, flexDirection: 'row', gap: spacing.xxl, paddingTop: spacing.lg },
  // Equal halves, each free to shrink: without minWidth 0 a long track name
  // widens its column and collapses the other.
  column: { flex: 1, minWidth: 0 },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.sm },
  empty: { ...type.small, color: colors.textDim, paddingVertical: spacing.md },
  note: { ...type.small, color: colors.textDim, lineHeight: 18, paddingTop: spacing.sm },
  timing: { paddingTop: spacing.md, gap: spacing.sm },
  timingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timingLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase' },
  timingValue: { ...type.small, color: colors.text, fontWeight: '600' },
  timingRow: { flexDirection: 'row', gap: spacing.sm },
});
