import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';

import { colors, radius, spacing, type } from '@/theme';

/**
 * The button set from Apple's TV app, as Swiftfin and Streamyfin also use it.
 *
 * Three shapes carry the whole app: one filled rounded rectangle for the single
 * thing you came to the screen to do, a translucent version of it for anything
 * secondary, and a circle for icon-only actions sitting beside them.
 *
 * The corner is deliberately not a capsule. `radius.pill` reads as a chip or a
 * tag, and using it on the primary action is the most common way these get
 * mistaken for a filter control - Apple keeps a rounded rectangle here and
 * reserves the capsule for smaller, secondary chrome.
 */

const PRESSED_SCALE = 0.96;

/**
 * Springs rather than a timing curve, because a press can be released before
 * it settles and a spring picks up from wherever it got to. Going down is
 * stiffer than coming back up: the touch should feel answered immediately,
 * while the release is what carries the small overshoot you feel as liveliness.
 *
 * ReduceMotion.System hands the decision to the accessibility setting, so this
 * flattens to an instant state change for anyone who has asked for that.
 */
const PRESS_IN = { damping: 20, stiffness: 420, mass: 0.5, reduceMotion: ReduceMotion.System };
const PRESS_OUT = { damping: 14, stiffness: 280, mass: 0.5, reduceMotion: ReduceMotion.System };

/** Cross-platform SF Symbol name, matching how the rest of the app calls SymbolView. */
export type Glyph = { ios: string; android: string; web: string };

function usePressScale(disabled?: boolean) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    animatedStyle,
    onPressIn: () => {
      // Reanimated shared values are assigned from handlers. That is the API.
      // eslint-disable-next-line react-hooks/immutability
      if (!disabled) scale.value = withSpring(PRESSED_SCALE, PRESS_IN);
    },
    onPressOut: () => {
      // Same.
      // eslint-disable-next-line react-hooks/immutability
      scale.value = withSpring(1, PRESS_OUT);
    },
  };
}

type BaseProps = {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The filled one. White on dark, one per screen: Play, or whatever the screen
 * exists to do.
 */
export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled,
  style,
}: BaseProps & { label: string; icon?: Glyph }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(disabled);
  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.primary, disabled && styles.primaryDisabled]}
      >
        {icon ? (
          <SymbolView
            name={icon as any}
            tintColor={disabled ? colors.textMuted : colors.accentContrast}
            size={17}
            weight="semibold"
          />
        ) : null}
        <Text style={[styles.primaryLabel, disabled && styles.disabledLabel]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The translucent one, for a second action that should not compete with the
 * primary. Blurred rather than a flat grey so it picks up whatever artwork sits
 * behind it, which is what stops it looking pasted on over a backdrop.
 */
export function GlassButton({
  label,
  icon,
  onPress,
  disabled,
  style,
}: BaseProps & { label: string; icon?: Glyph }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(disabled);
  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.glassWrap, disabled && styles.glassDisabled]}
      >
        <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.glassLift]} />
        {icon ? (
          <SymbolView
            name={icon as any}
            tintColor={disabled ? colors.textDim : colors.text}
            size={17}
            weight="semibold"
          />
        ) : null}
        <Text style={[styles.glassLabel, disabled && styles.disabledLabel]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Icon-only, circular, sitting beside a primary button - cast, share, more.
 *
 * `tint` exists for the states Apple gives a colour to, like an active AirPlay
 * or cast route; leave it unset and the glyph takes the normal foreground.
 */
export function CircleButton({
  icon,
  onPress,
  disabled,
  style,
  tint,
  size = 52,
  progress,
  accessibilityLabel,
}: BaseProps & {
  icon: Glyph;
  tint?: string;
  size?: number;
  /**
   * 0 to 1, drawn as the button filling from the bottom.
   *
   * For work that is already happening because you pressed this button - a
   * download - so the button itself is the most honest place to show it. Null
   * or undefined draws nothing.
   */
  progress?: number | null;
  accessibilityLabel: string;
}) {
  const filled = progress == null ? null : Math.max(0, Math.min(1, progress));
  const { animatedStyle, onPressIn, onPressOut } = usePressScale(disabled);
  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <BlurView tint="dark" intensity={40} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
        <View style={[StyleSheet.absoluteFill, styles.glassLift, { borderRadius: size / 2 }]} />
        {filled != null ? (
          // Under the glyph, above the glass: the icon stays readable at every
          // level, which a ring around the edge would not manage at this size.
          <View
            style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: 'hidden' }]}
            pointerEvents="none"
          >
            <View style={[styles.fill, { height: `${filled * 100}%` }]} />
          </View>
        ) : null}
        <SymbolView
          name={icon as any}
          tintColor={tint ?? (disabled ? colors.textDim : colors.text)}
          size={Math.round(size * 0.44)}
          weight="semibold"
        />
      </Pressable>
    </Animated.View>
  );
}

/** A row of buttons that share a baseline: primary stretches, circles do not. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const HEIGHT = 52;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },

  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(245, 245, 247, 0.30)' },

  primary: {
    height: HEIGHT,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  primaryDisabled: { backgroundColor: colors.surface },
  primaryLabel: { color: colors.accentContrast, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },

  glassWrap: {
    height: HEIGHT,
    borderRadius: radius.button,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
  },
  glassDisabled: { opacity: 0.55 },
  glassLabel: { ...type.bodyStrong, fontSize: 17, color: colors.text, letterSpacing: -0.3 },
  // the white wash that lifts the blur, rather than darkening it
  glassLift: { backgroundColor: colors.glassLift },

  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
  },

  disabledLabel: { color: colors.textMuted },
});
