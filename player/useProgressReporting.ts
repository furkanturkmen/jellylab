import { useEffect, useRef } from 'react';

import * as Jellyfin from '@/api/jellyfin';
import type { PlayMethod } from '@/api/jellyfin';
import { queueProgress } from '@/store/outbox';
import { secondsToTicks } from '@/player/progress';

/**
 * Telling the server where you are, for either engine.
 *
 * Both players had their own copy of this - a start on mount, a stop on
 * unmount, a ping every fifteen seconds and an immediate report when you pause
 * - and both copies had been broken in the same way at different times, by the
 * same thing: reading `position` from a closure instead of at the moment of
 * the call.
 *
 * That mistake wiped resume points. The unmount handler kept the position from
 * the first render, which is zero, so leaving a film reported "stopped at 0"
 * and the next play started from the beginning. And an interval rebuilt on
 * every position change restarted its fifteen second timer several times a
 * second, so nothing was ever reported mid-playback.
 *
 * Neither is possible here. Nothing takes a position: it takes a way to ask
 * for one, kept current in a ref, and asks when it needs to know.
 */
export function useProgressReporting({
  itemId,
  playMethod,
  resumeSeconds,
  paused,
  positionAt,
  onStop,
}: {
  itemId: string;
  playMethod: PlayMethod;
  /** Where this playback began, reported once so the server agrees from the start. */
  resumeSeconds: number;
  paused: boolean;
  /** Asked for the current position, in seconds, at the moment of every report. */
  positionAt: () => number;
  /**
   * Local bookkeeping on the way out, before the server is told.
   *
   * The engines differ: one only records a position for a downloaded file,
   * the other records every time. That is theirs to decide, so it is a
   * callback rather than a flag.
   */
  onStop?: (ticks: number) => void;
}): void {
  // Everything the timers need, read at call time rather than captured.
  const live = useRef({ positionAt, paused, onStop, playMethod });
  // The timers read this at fire time rather than capturing it.
  // eslint-disable-next-line react-hooks/refs
  live.current = { positionAt, paused, onStop, playMethod };

  // Start on mount, stop on unmount. Deliberately once per player: a new
  // itemId means a new player, because the source changed with it.
  useEffect(() => {
    Jellyfin.reportPlaybackStart(itemId, secondsToTicks(resumeSeconds), live.current.playMethod)
      .catch(() => {});
    return () => {
      try {
        const ticks = secondsToTicks(live.current.positionAt());
        live.current.onStop?.(ticks);
        Jellyfin.reportPlaybackStopped(itemId, ticks, live.current.playMethod)
          .catch(() => queueProgress(itemId, ticks));
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // A ping every fifteen seconds. Its dependencies are deliberately thin: the
  // position it reports comes from the ref, so nothing about playback can
  // restart this timer.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        Jellyfin.reportPlaybackProgress(
          itemId,
          secondsToTicks(live.current.positionAt()),
          live.current.paused,
          live.current.playMethod,
        ).catch(() => {});
      } catch {}
    }, 15_000);
    return () => clearInterval(id);
  }, [itemId]);

  /*
   * Pausing is worth saying straight away rather than up to fifteen seconds
   * later, or a paused film goes on counting as playing on the server.
   *
   * Skipped on the first run, where reportPlaybackStart has just said the same
   * thing.
   */
  const reported = useRef(true);
  useEffect(() => {
    if (reported.current) {
      reported.current = false;
      return;
    }
    Jellyfin.reportPlaybackProgress(
      itemId,
      secondsToTicks(live.current.positionAt()),
      paused,
      live.current.playMethod,
    ).catch(() => {});
  }, [paused, itemId]);
}
