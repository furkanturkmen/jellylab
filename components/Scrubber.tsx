import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { PREVIEW_WIDTH, TrickplayPreview } from '@/components/TrickplayPreview';
import { trickplayTileAt, type TrickplayInfo } from '@/lib/trickplay';
import { colors } from '@/theme';

/**
 * The player's progress bar, and the clock beside it.
 *
 * Lifted out of the item screen, which had grown past three thousand lines
 * with both engines, the episode list and this inside it. Nothing here reaches
 * back into that screen - it takes a position, a duration and three callbacks,
 * which is what made it the first thing worth moving.
 */

export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(h > 0 ? 2 : 1, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function Scrubber({
  position, duration, trickplay, onScrubStart, onScrub, onScrubEnd,
}: {
  position: number;
  duration: number;
  /** Scrub previews, when the server has them for what is playing. */
  trickplay?: { itemId: string; info: TrickplayInfo; token: string } | null;
  onScrubStart: () => void;
  onScrub: (t: number) => void;
  onScrubEnd: (t: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // Whether a finger is down, which is the only time a preview is wanted.
  const [dragging, setDragging] = useState(false);
  const durationRef = useRef(duration);
  const widthRef = useRef(width);
  const startXRef = useRef(0);
  // The responder is built once and reads these at gesture time. An effect
  // would leave them one render stale, which is how a drag ended up measured
  // against a duration of zero.
  // eslint-disable-next-line react-hooks/refs
  durationRef.current = duration;
  // Same: read at gesture time, not captured at build time.
  // eslint-disable-next-line react-hooks/refs
  widthRef.current = width;

  function xToTime(x: number): number {
    const w = widthRef.current;
    const ratio = Math.max(0, Math.min(1, x / w));
    return ratio * durationRef.current;
  }

  // Whether the gesture in progress is one this bar accepted. A remount puts
  // width back to zero until onLayout runs, and a drag measured against a bar
  // of no width sends every leftward move to 00:00.
  const activeRef = useRef(false);

  /*
   * The callbacks, through refs.
   *
   * The responder below is built once and would otherwise hold the callbacks
   * from the first render - which close over the state of that render, when
   * the duration is still zero and the seek it performs is against nothing.
   * Rebuilding the responder on every render is the alternative, and that
   * drops the gesture mid-drag.
   */
  const handlers = useRef({ onScrubStart, onScrub, onScrubEnd });
  // Same: the callbacks have to be current when the finger moves.
  // eslint-disable-next-line react-hooks/refs
  handlers.current = { onScrubStart, onScrub, onScrubEnd };

  // Same.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => widthRef.current > 0,
    onMoveShouldSetPanResponder: () => widthRef.current > 0,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      if (widthRef.current <= 0) return;
      const x = (e.nativeEvent as any).locationX ?? 0;
      startXRef.current = x;
      activeRef.current = true;
      setDragging(true);
      handlers.current.onScrubStart();
      handlers.current.onScrub(xToTime(x));
    },
    onPanResponderMove: (_e, gs) => {
      if (!activeRef.current) return;
      const x = startXRef.current + gs.dx;
      handlers.current.onScrub(xToTime(x));
    },
    onPanResponderRelease: (_e, gs) => {
      if (!activeRef.current) return;
      const x = startXRef.current + gs.dx;
      activeRef.current = false;
      setDragging(false);
      handlers.current.onScrubEnd(xToTime(x));
    },
    onPanResponderTerminate: (_e, gs) => {
      if (!activeRef.current) return;
      const x = startXRef.current + gs.dx;
      activeRef.current = false;
      setDragging(false);
      handlers.current.onScrubEnd(xToTime(x));
    },
  }), []);

  const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) * 100 : 0;
  // Worked out here rather than inside the preview so the preview can be
  // memoised on the cell: a drag that has not crossed into the next thumbnail
  // then costs nothing to draw.
  const cell = dragging && trickplay ? trickplayTileAt(position, trickplay.info) : null;

  return (
    <View
      style={styles.scrubberHit}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {/*
        * The preview follows the thumb but stops at either end, so it never
        * hangs off the screen with half of it invisible.
        */}
      {cell && trickplay ? (
        <View
          style={[
            styles.scrubberPreview,
            {
              left: Math.max(
                0,
                Math.min(
                  (pct / 100) * width - PREVIEW_WIDTH / 2,
                  Math.max(0, width - PREVIEW_WIDTH),
                ),
              ),
            },
          ]}
          pointerEvents="none"
        >
          <TrickplayPreview
            itemId={trickplay.itemId}
            info={trickplay.info}
            token={trickplay.token}
            tileIndex={cell.tileIndex}
            x={cell.x}
            y={cell.y}
          />
        </View>
      ) : null}
      {/*
        * Nothing in here may be the touch target.
        *
        * locationX is measured against whichever view was actually touched,
        * not against the one holding the responder - so grabbing the thumb,
        * which is fourteen points wide, reported an x of about seven and sent
        * every drag from there to the start of the film. Grabbing the thumb is
        * how you scrub.
        */}
      <View style={styles.scrubberTrack} pointerEvents="none">
        <View style={[styles.scrubberFill, { width: `${pct}%` }]} />
        <View style={[styles.scrubberThumb, { left: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrubberHit: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
  },
  scrubberFill: { height: '100%', backgroundColor: colors.text, borderRadius: 2 },
  // Clear of the 32pt hit area, so a thumb never covers the frame it picked.
  scrubberPreview: { position: 'absolute', bottom: 34 },
  scrubberThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    marginLeft: -7,
  },
});
