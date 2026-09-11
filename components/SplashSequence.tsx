import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Brand, Mark, Type } from '@/constants/brand';
import { colors } from '@/theme';
import { PULSE_PATHS, PULSE_PUSH, RESTING_PATH, SWIM_SAMPLES } from '@/lib/bellMorph';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/*
 * The build-up, beat for beat from the kit's own live splash.
 *
 * Each beat carries its own delay, duration and easing rather than being
 * sampled off one shared clock. Sampling a linear clock is how this ended up
 * with every beat moving at a constant rate: the curve is what makes a thing
 * *arrive* rather than travel, and without it the opening reads as mechanical
 * however many frames it hits.
 *
 * Timings are the kit's, verbatim:
 *   kIris  .72s cubic-bezier(.2,.66,.3,1)   @.46s
 *   kHole  .20s linear                      @.54s
 *   kVeil  .68s cubic-bezier(.22,.61,.36,1) @.78s
 *   kLine  .66s cubic-bezier(.22,.61,.36,1) @.96s
 *   kWord  .54s cubic-bezier(.22,.61,.36,1) @1.06s
 *   kSub   .58s cubic-bezier(.22,.61,.36,1) @1.24s
 */
const KIT_EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
const IRIS_EASE = Easing.bezier(0.2, 0.66, 0.3, 1);

/*
 * The kit's first beat fades the triangle in over the opening 260ms. The OS is
 * already holding that frame for us - `assets/splash-seed.png` is the triangle
 * at rest - so our view mounts where that beat ended and every later beat keeps
 * its spacing by shifting back the same amount.
 */
const SEED_OFFSET = 260;

const BEATS = {
  iris: { at: 460, dur: 720, easing: IRIS_EASE },
  hole: { at: 540, dur: 200, easing: Easing.linear },
  veil: { at: 780, dur: 680, easing: KIT_EASE },
  line: { at: 960, dur: 660, easing: KIT_EASE },
  word: { at: 1060, dur: 540, easing: KIT_EASE },
  sub: { at: 1240, dur: 580, easing: KIT_EASE },
} as const;

/** The last beat to land. Rest is here, not at the spec's nominal 1.50s. */
const REST_AT = BEATS.sub.at + BEATS.sub.dur - SEED_OFFSET;

const PRESS_DUR = 260;
const SWIM_DUR = 2600;

/** The bell irises out of the triangle's centre, from a point rather than from nothing. */
const IRIS_FROM = 0.06;

/*
 * The swim, from five numbers rather than authored keyframes, so the exit
 * direction stays a runtime value rather than something baked into a curve.
 */
const SWIM = {
  /*
   * Not straight up. A heading of exactly -90 degrees reads as a UI element
   * being dismissed upward rather than as something swimming, because nothing
   * alive travels on a ruler.
   */
  heading: -Math.PI / 2 + 0.1,
  /** Perpendicular, as a fraction of *one pulse's* travel - not of the whole. */
  sway: 0.2,
  cycles: 4,
  distance: 300,
  /** Degrees of tilt at peak lateral velocity. */
  bank: 5,
};

type Props = {
  /** Held at the resting frame until this is true. Never gates startup. */
  ready: boolean;
  onFinish: () => void;
};

export default function SplashSequence({ ready, onFinish }: Props) {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  // Set in an effect rather than at render: reading the clock during render
  // is impure, and the lint rule that says so is right.
  const mountedAt = useRef(0);

  // One value per beat, each driven by its own curve.
  const iris = useSharedValue(0);
  const hole = useSharedValue(0);
  const veil = useSharedValue(0);
  const line = useSharedValue(0);
  const word = useSharedValue(0);
  const sub = useSharedValue(0);

  const press = useSharedValue(0);
  const swimT = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    mountedAt.current = Date.now();
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => {
      if (alive) setReduceMotion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;

    const beats = [
      [iris, BEATS.iris],
      [hole, BEATS.hole],
      [veil, BEATS.veil],
      [line, BEATS.line],
      [word, BEATS.word],
      [sub, BEATS.sub],
    ] as const;

    if (reduceMotion) {
      // Straight to the resting frame. There is nothing to watch.
      for (const [v] of beats) v.value = 1;
      return;
    }

    for (const [v, b] of beats) {
      v.value = withDelay(
        Math.max(0, b.at - SEED_OFFSET),
        withTiming(1, { duration: b.dur, easing: b.easing }),
      );
    }
  }, [reduceMotion, iris, hole, veil, line, word, sub]);

  // The exit. Runs only once the app behind it is ready, which is why a slow
  // launch holds a still, correct frame rather than gating on animation.
  useEffect(() => {
    if (!ready || reduceMotion === null) return;

    if (reduceMotion) {
      fade.value = withTiming(0, { duration: 240, easing: KIT_EASE }, done => {
        if (done) runOnJS(onFinish)();
      });
      return;
    }

    // Never before the build-up has landed, however quickly the app was ready.
    const elapsed = Date.now() - mountedAt.current;
    const hold = Math.max(0, REST_AT - elapsed);

    press.value = withDelay(hold + 120, withTiming(1, { duration: PRESS_DUR, easing: KIT_EASE }));
    swimT.value = withDelay(
      hold + 420,
      withTiming(1, { duration: SWIM_DUR, easing: Easing.linear }, done => {
        if (done) runOnJS(onFinish)();
      }),
    );
    fade.value = withDelay(hold + 420 + SWIM_DUR - 500, withTiming(0, { duration: 500 }));
  }, [ready, reduceMotion, press, swimT, fade, onFinish]);

  /*
   * The trajectory, derived rather than keyframed.
   *
   * Travel accumulates through the thrust and keeps accumulating, slowing,
   * through the coast. Sway is one lobe per pulse - zero at both boundaries,
   * which is what makes direction reverse only between pulses.
   */
  const swim = useDerivedValue(() => {
    const p = swimT.value * SWIM.cycles;
    const index = Math.floor(p);
    const phase = p - index;
    const sample = Math.min(SWIM_SAMPLES - 1, Math.floor(phase * SWIM_SAMPLES));
    const push = PULSE_PUSH[sample];

    const travelled = (index + push) / SWIM.cycles;
    const along = travelled * SWIM.distance;

    const perPulse = SWIM.distance / SWIM.cycles;
    const direction = index % 2 === 0 ? 1 : -1;
    const lateral = Math.sin(Math.PI * phase) * SWIM.sway * perPulse * direction;
    const bank = Math.cos(Math.PI * phase) * direction * SWIM.bank;

    return { sample, along, lateral, bank };
  });

  const bellProps = useAnimatedProps(() => ({
    d: swimT.value > 0 ? PULSE_PATHS[swim.value.sample] : RESTING_PATH,
  }));

  // The iris: the bell grows out of the play triangle's own centre, so the two
  // shapes are never briefly unrelated.
  const irisProps = useAnimatedProps(() => {
    const s = IRIS_FROM + (1 - IRIS_FROM) * iris.value;
    return {
      transform: `translate(${Mark.playCentre.x} ${Mark.playCentre.y}) scale(${s}) translate(${-Mark.playCentre.x} ${-Mark.playCentre.y})`,
      opacity: iris.value,
    };
  });

  /*
   * The triangle and the hole are one cross-fade.
   *
   * The gradient triangle is what appears first; the knockout is what it
   * becomes. Fading one out as the other comes in keeps it a knockout at every
   * point in between, rather than letting a third colour exist for 200ms.
   */
  const playProps = useAnimatedProps(() => ({ opacity: 1 - hole.value }));
  const knockoutProps = useAnimatedProps(() => ({ opacity: hole.value }));

  const veilProps = useAnimatedProps(() => ({
    transform: `translate(0 ${300 * (1 - veil.value)})`,
    opacity: Mark.veilOpacity * veil.value,
  }));

  const lineProps = useAnimatedProps(() => {
    const w = 512 * line.value;
    // It dims as the bell pushes off it: the horizon should not still be at
    // full strength once the thing it belonged to has gone.
    const leaving = interpolate(swimT.value, [0, 0.35], [1, 0], Extrapolation.CLAMP);
    return {
      x: (512 - w) / 2,
      width: w,
      opacity: Mark.levelLine.opacity * line.value * leaving,
    };
  });

  const markStyle = useAnimatedStyle(() => {
    // Press: a dip that has to end where it started, so a half sine.
    const dip = 1 - 0.038 * Math.sin(press.value * Math.PI);
    const { along, lateral, bank } = swim.value;

    // Travel along the heading, sway perpendicular to it - as vectors, so that
    // `heading` stays a real runtime parameter.
    const cos = Math.cos(SWIM.heading);
    const sin = Math.sin(SWIM.heading);
    return {
      transform: [
        { translateX: cos * along - sin * lateral },
        { translateY: sin * along + cos * lateral },
        { rotateZ: `${bank}deg` },
        { scale: dip },
      ],
    };
  });

  const ringProps = useAnimatedProps(() => ({
    r: interpolate(press.value, [0, 1], [0, 260], Extrapolation.CLAMP),
    opacity: interpolate(press.value, [0, 0.4, 1], [0, 0.5, 0], Extrapolation.CLAMP),
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: 9 * (1 - word.value) }],
  }));

  const subStyle = useAnimatedStyle(() => ({
    opacity: 0.72 * sub.value,
    transform: [{ translateY: 6 * (1 - sub.value) }],
  }));

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (reduceMotion === null) return null;

  // 200pt, matching the plugin's imageWidth, so our mark lands where the OS
  // drew the launch image's.
  const size = 200;

  return (
    <Animated.View
      style={[styles.root, { width, height }, rootStyle]}
      pointerEvents="none"
      onLayout={() => {
        // Hide the native still only once our own view has laid out, so the two
        // swap with nothing in between.
        SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <Animated.View style={[styles.mark, { width: size, height: size }, markStyle]}>
        <Svg width={size} height={size} viewBox="0 0 512 512">
          <Defs>
            {/*
              Pinned in the bell's own 1024 space. Pinning it to the 512 tile
              instead lands the whole gradient span in one corner of the bell
              and clamps the mark to flat blue.
            */}
            <LinearGradient
              id="g"
              gradientUnits="userSpaceOnUse"
              x1={Mark.gradient.x1}
              y1={Mark.gradient.y1}
              x2={Mark.gradient.x2}
              y2={Mark.gradient.y2}
            >
              <Stop offset="0" stopColor={Brand.glyphFrom} />
              <Stop offset="1" stopColor={Brand.glyphTo} />
            </LinearGradient>
            <ClipPath id="cb">
              <Path d={Mark.bell} />
            </ClipPath>
          </Defs>

          <G transform={Mark.splashTransform}>
            <G transform={Mark.tileTransform}>
              <AnimatedG animatedProps={irisProps}>
                <AnimatedPath animatedProps={bellProps} fill="url(#g)" />
                {/*
                  The veil, rising to the level line. It is the ground at 18%
                  rather than a second hue - and here that ground is the app's
                  own, since this mark sits on the app rather than on the tile.
                */}
                <G clipPath="url(#cb)">
                  <AnimatedPath animatedProps={veilProps} d={Mark.veil} fill={colors.bg} />
                </G>
              </AnimatedG>

              {/* Frame 0: the triangle as a gradient shape of its own. */}
              <AnimatedPath animatedProps={playProps} d={Mark.play} fill="url(#g)" />
              {/* The knockout it becomes, filled with the ground behind it. */}
              <AnimatedPath animatedProps={knockoutProps} d={Mark.play} fill={colors.bg} />

              {/* The press ring, pushed out of the play hole's own centre. */}
              <AnimatedCircle
                animatedProps={ringProps}
                cx={Mark.playCentre.x}
                cy={Mark.playCentre.y}
                fill="none"
                stroke={Brand.glyphTo}
                strokeWidth={8}
              />
            </G>
          </G>
        </Svg>
      </Animated.View>

      {/*
        The level line is a horizon, so it does not go with the bell. Drawn in
        its own untransformed layer: inside the mark's <Svg> it inherited the
        swim's bank and travel, which tilted the horizon and dragged it up the
        screen behind the mark.
      */}
      <Animated.View style={[styles.line, { width: size, height: size }]} pointerEvents="none">
        <Svg width={size} height={size} viewBox="0 0 512 512">
          <AnimatedRect
            animatedProps={lineProps}
            y={Mark.levelLine.y}
            height={Mark.levelLine.height}
            fill={Mark.levelLine.color}
          />
        </Svg>
      </Animated.View>

      <Animated.View style={styles.copy}>
        <Animated.Text style={[styles.word, wordStyle]}>JellyLab</Animated.Text>
        <Animated.Text style={[styles.sub, subStyle]}>Watch and request, in one place</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  copy: { position: 'absolute', bottom: '18%', alignItems: 'center' },
  word: {
    fontFamily: Type.display,
    fontSize: 28,
    letterSpacing: Type.displayTracking(28),
    color: Brand.text,
  },
  sub: {
    fontFamily: Type.mono,
    fontSize: 11,
    letterSpacing: Type.monoTracking(11),
    textTransform: 'uppercase',
    color: Brand.text2,
    marginTop: 10,
  },
});
