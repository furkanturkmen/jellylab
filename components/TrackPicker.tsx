import { Fragment, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { DelayButton, SubGroupLabel, TrackRow } from '@/components/TrackRow';
import { colors, spacing, type } from '@/theme';

/**
 * The audio and subtitle picker, drawn over the film rather than beside it.
 *
 * It was a formSheet route: pushing it took the player off screen, UIKit drew
 * a card on a background of its own, and the glass had nothing to be glass
 * over - it sampled the sheet's own backdrop and read as flat grey. It also
 * meant navigating away from a playing film to answer a question about it.
 *
 * Drawn here it is just another layer of the player, like the play button.
 *
 * A heavy dark blur rather than liquid glass. Glass refracts - it bends what is
 * behind it and keeps it legible, which over a bright frame meant reading track
 * names off someone's face. Blur destroys the detail instead: the film is still
 * there as soft light and colour, and nothing in it competes with the list.
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

  /*
   * Up from the bottom, and back down on the way out.
   *
   * The exit is why this component owns the closing rather than the player:
   * the player unmounting it on a choice would cut the animation off at its
   * first frame. It calls the row's action, plays itself out, and only then
   * tells the player it is done.
   */
  // useState rather than a ref: the value is read while building the style
  // below, and reading a ref during render is exactly what the compiler warns
  // about. Held in state it is created once and never set again.
  const [slide] = useState(() => new Animated.Value(0));
  const leaving = useRef(false);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  function dismiss(after?: () => void) {
    // A second press while it is already on its way out would start the
    // animation again and call back twice.
    if (leaving.current) return;
    leaving.current = true;
    after?.();
    Animated.timing(slide, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }

  const style = {
    opacity: slide,
    transform: [
      {
        translateY: slide.interpolate({
          inputRange: [0, 1],
          // A short rise. The whole panel travelling the height of the screen
          // reads as a page arriving rather than a control opening.
          outputRange: [64, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      {/*
        * Blur first, then a tint over it.
        *
        * The blur is what makes the film stop competing: at full intensity a
        * face becomes a soft shape and a bright frame becomes a glow, and
        * neither reads as something you might be missing. The tint on top is
        * what takes it to near-black, so a white title has the same contrast
        * over a snow scene as over a night one.
        */}
      <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />

      {/* Anywhere off the lists closes it, the way tapping beside a sheet did. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} accessibilityLabel={t('common.close')} />

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
          onPress={() => dismiss()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={colors.text} size={22} />
        </TouchableOpacity>

        <View style={styles.columns}>
          <Column title={t('player.audio')} rows={audio} empty={t('player.noAudio')} note={audioNote} onPicked={dismiss} />
          <Column title={t('player.subtitles')} rows={subtitles} empty={t('player.noSubtitles')} onPicked={dismiss} />
        </View>

        {timing ? <Timing timing={timing} /> : null}
      </View>
    </Animated.View>
  );
}

function Column({ title, rows, empty, note, onPicked }: {
  title: string;
  rows: PickerRow[];
  empty: string;
  note?: string | null;
  /** Runs the choice, then plays the panel out. */
  onPicked: (after: () => void) => void;
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
              <TrackRow label={row.label} selected={row.selected} onPress={() => onPicked(row.onPick)} />
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
  /*
   * Over the blur, and most of the way to black.
   *
   * The blur alone leaves the film's brightness behind: a snow scene under a
   * heavy blur is still a bright grey field, and light text on it is unreadable
   * while the same text over a night scene is fine. The tint is what makes the
   * surface the same whatever is playing, and it is the film's colour rather
   * than pure black so the picture is still faintly there.
   */
  tint: { backgroundColor: 'rgba(11, 11, 13, 0.82)' },
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
