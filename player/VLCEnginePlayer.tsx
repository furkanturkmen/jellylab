import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { cleanSubLabel } from '@/components/TrackRow';
import { Scrubber, formatTime } from '@/components/Scrubber';
import { TrackPicker, type PickerRow } from '@/components/TrackPicker';
import { IS_TABLET } from '@/lib/device';
import { logRequestFailure } from '@/lib/errorLog';
import { resolvedTrackLanguage, withLanguage } from '@/lib/tracks';
import { type TrickplayInfo } from '@/lib/trickplay';
import { CONTROLS_HIDE_MS, SPEEDS, type AudioStream } from '@/player/config';
import { matchesLanguage, pickSubtitle } from '@/player/lang';
import { styles } from '@/player/styles';
import { useProgressReporting } from '@/player/useProgressReporting';
import { parseVtt, findActiveCue, type VttCue } from '@/player/vtt';
import { localSubtitleSync, localUriSync, saveLocalPosition } from '@/store/downloads';
import { openPlayerSheet } from '@/store/playerSheet';
import { loadPrefs, savePrefs, type Prefs, withAudioChoice, withSubtitleChoice, withSubtitleDelay } from '@/store/prefs';
import { colors } from '@/theme';

/**
 * Playback through libVLC, for everything AVPlayer will not open.
 *
 * Out of the item screen, which held both engines and the screen itself in one
 * file of nearly three thousand lines. Every player bug found while testing
 * 0.18.1 lived in there, and none of them could be reached by a test.
 *
 * The two engines are deliberately separate files rather than one with a
 * switch: they share the chrome (player/styles) and the reporting
 * (player/useProgressReporting), and nothing else. What differs is the video
 * view underneath and where the position comes from.
 */

export function VLCEnginePlayer({ url, itemId, mediaSourceId, externalSubs, audioStreams, preferredAudioLanguage, originalLanguage, delayKey, title, resumeSeconds, initialDuration, playMethod = 'DirectPlay', trickplay, onEnded, onExit }: {
  /** Already resolved by the screen, so "original" means something here too. */
  preferredAudioLanguage?: string;
  /** What the title was made in - names a track the file left untagged. */
  originalLanguage?: string;
  url: string;
  itemId: string;
  mediaSourceId?: string;
  externalSubs: { index: number; label: string }[];
  audioStreams: AudioStream[];
  delayKey: string;
  title: string;
  resumeSeconds: number;
  initialDuration: number;
  playMethod?: Jellyfin.PlayMethod;
  /** Scrub previews, with the token needed to fetch a sheet. */
  trickplay?: { info: TrickplayInfo; token: string } | null;
  /** The file reached its end, as opposed to the viewer leaving. */
  onEnded?: () => void;
  onExit: () => void;
}) {
  const vlcRef = useRef<any>(null);
  const lastSeekAt = useRef(0);
  // Where the last seek was going, in seconds. Paired with lastSeekAt so
  // onProgress can tell "VLC has not caught up yet" from "VLC is there".
  const lastSeekTo = useRef(0);
  const router = useRouter();
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  /*
   * Starts where the film starts, not at zero.
   *
   * Nothing was wrong with the resume itself - the picture was already at the
   * right frame. This is the clock and the scrubber, which learn the position
   * from the first progress tick and so read 0:00 for a quarter of a second
   * before jumping to it. Seeded, they are right from the first paint.
   */
  const [position, setPosition] = useState(resumeSeconds);
  const [duration, setDuration] = useState(initialDuration);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  /*
   * The controls fade rather than blink.
   *
   * They were mounted and unmounted outright, so a tap swapped them in whole
   * and the auto-hide four seconds later swapped them out again - over a
   * moving picture that reads as a flicker rather than a control appearing.
   * Kept mounted and faded instead, with pointerEvents following the state so
   * a hidden overlay cannot swallow the tap meant to bring it back.
   */
  const [controlsFade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.timing(controlsFade, {
      toValue: controlsVisible ? 1 : 0,
      duration: controlsVisible ? 160 : 220,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, controlsFade]);

  // Drawn over the film rather than pushed as a route - see components/TrackPicker.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Whether the film was running when the picker opened, so closing it can put
  // things back rather than deciding for you.
  const resumeAfterPicker = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  // Read off the window rather than remembered. A lock set at mount, a
  // rotation, or the system overriding either one all show up here, whereas a
  // remembered flag starts out disagreeing with the screen - which made the
  // first press of the fullscreen button do nothing at all.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isLandscape = winWidth > winHeight;
  const [ready, setReady] = useState(false);

  const [rate, setRate] = useState(1);
  const [activeSubIndex, setActiveSubIndex] = useState<number | null>(null);
  const [externalCues, setExternalCues] = useState<VttCue[]>([]);
  const [activeCue, setActiveCue] = useState<VttCue | null>(null);
  const [subFontSize, setSubFontSize] = useState(18);
  /**
   * Bumped to rebuild VLC, which is now only wanted when switching to an
   * external subtitle: VLC ignores the textTrack prop going from a track it
   * auto-selected to -1, and starting fresh is the only way to be rid of it.
   * Returning from the background used to do this too, and that is what made
   * every glance at another app cost a spinner and a re-buffer.
   */
  const [vlcKey, setVlcKey] = useState(0);
  const positionRef = useRef(resumeSeconds);
  const [vlcTextTracks, setVlcTextTracks] = useState<{ id: number; name?: string }[]>([]);
  const [vlcTextTrackId, setVlcTextTrackId] = useState<number>(-1); // -1 = off
  const [vlcAudioTracks, setVlcAudioTracks] = useState<{ id: number; name?: string }[]>([]);
  const [vlcAudioTrackId, setVlcAudioTrackId] = useState<number>(-1);
  const [subDelayMs, setSubDelayMs] = useState(0);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const prefsRef = useRef<Prefs | null>(null);
  /**
   * What we last asked VLC for. A remount gives us a fresh media player that
   * reselects the container's own defaults, so these are what gets asserted
   * again on the next load rather than whatever React state happens to hold.
   */
  const desiredTextTrack = useRef(-1);
  const desiredAudioTrack = useRef<number | null>(null);
  /**
   * Where the media itself should begin, handed to libVLC rather than seeked
   * to afterwards.
   *
   * Opening something part-watched used to play the opening seconds and then
   * jump: VLC started at zero because that is where a file starts, and the
   * resume point was only applied once onLoad had fired. `--start-time` is an
   * input option, read when the media is created, so the first frame drawn is
   * already the right one.
   *
   * Read from a ref at media-creation time, not from state: on a rebuild
   * (switching to an external subtitle) the film is mid-play, and the position
   * to come back to is wherever it had reached, not the resume point the route
   * was opened with.
   */
  const startAtRef = useRef(resumeSeconds);
  /*
   * Only the options are memoised, and the object wrapping them is built fresh
   * in the JSX below.
   *
   * VLCPlayer writes to the source it is handed - isNetwork, autoplay and
   * initOptions are all assigned onto it - and a value that survives a render
   * has been frozen by then, so the second render threw "attempted to set the
   * key `isNetwork` ... on an object that is meant to be immutable". Handing
   * it a new object each time is what the library expects, and is what the
   * plain `{{ uri: url }}` here did before.
   */
  const initOptions = useMemo(() => {
    const startAt = positionRef.current > 0 ? positionRef.current : resumeSeconds;
    startAtRef.current = startAt;
    return startAt > 0 ? [`--start-time=${startAt.toFixed(3)}`] : [];
    // positionRef is deliberately absent: this is meant to be read at the
    // moment a media is built, which is exactly when url or vlcKey change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, vlcKey, resumeSeconds]);
  const audioAutoPicked = useRef(false);

  // Keep positionRef synced so background/foreground can restore.
  useEffect(() => { positionRef.current = position; }, [position]);
  // Same for the duration: the resume handler has no dependencies and would
  // otherwise read whatever the duration was when the player mounted.
  const durationRef = useRef(duration);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Same trick for paused: the reporting below has to read the current value
  // without listing it as a dependency.
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  /**
   * Reattach the video surface when coming back from the background.
   *
   * iOS drops it while backgrounded, leaving audio playing over a black frame.
   * This used to rebuild the whole player, which fixed the frame and cost
   * everything else: a spinner, a reload, a re-buffer and the tracks chosen by
   * hand, every single time the app was left and returned to - which for a
   * phone is constantly.
   *
   * A seek to where it already is redraws the surface without any of that.
   * The position does not change, so there is nothing to buffer; VLC simply
   * paints again. The play state is re-asserted after it, since a seek starts
   * playback and the film may well have been paused when it was left.
   *
   * Only a real background warrants even this. Control Center, the
   * notification shade, or a call banner move the app to 'inactive' and
   * straight back to 'active' without ever taking the surface away.
   */
  const wasBackgrounded = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wasBackgrounded.current = true;
      } else if (state === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        const secs = positionRef.current;
        const dur = durationRef.current;
        try {
          if (secs > 0 && dur > 0) {
            lastSeekAt.current = Date.now();
            lastSeekTo.current = secs;
            vlcRef.current?.seek?.(Math.max(0, Math.min(1, secs / dur)));
          }
          // After the seek, not before: seeking resumes a paused player.
          setTimeout(() => {
            try { vlcRef.current?.resume?.(!pausedRef.current); } catch {}
          }, 250);
        } catch {}
      }
    });
    return () => sub.remove();
  }, []);

  // Start, stop, the fifteen second ping and the report on pause - all of it
  // in player/useProgressReporting, which both engines share.
  useProgressReporting({
    itemId,
    playMethod,
    resumeSeconds,
    paused,
    positionAt: () => positionRef.current,
    // Only for a file that is actually on the device.
    onStop: () => rememberLocalPosition(),
  });

  // Apply subtitle prefs + auto-select last-used or preferred language sub.
  useEffect(() => {
    (async () => {
      const prefs = await loadPrefs();
      prefsRef.current = prefs;
      const sizeMap = { sm: 14, md: 18, lg: 24 } as const;
      setSubFontSize(sizeMap[prefs.subtitleSize] ?? 18);
      setSubDelayMs(prefs.subtitleDelays?.[delayKey] ?? 0);
      setPrefsLoaded(true);

      console.log(
        `[jellylab] player:subPrefs language=${prefs.subtitleLanguage || 'unset'}` +
        ` chosen=${prefs.subtitleChoices?.[delayKey] || 'none'}` +
        ` offset=${prefs.subtitleDelays?.[delayKey] ?? 0}ms available=${externalSubs.length}` +
        /*
         * The labels, not just how many.
         *
         * Three wrong picks in a row came down to a label this log did not
         * print: the count said a better track existed, and nothing said what
         * it was called or why it lost. The ranking works on labels, so the
         * labels are the evidence.
         */
        ` tracks=${JSON.stringify(externalSubs.map(x => `${x.index}:${x.label}`))}`,
      );
      /*
       * A choice made about this title, if there is one.
       *
       * Keyed per title. It used to be one label for everything, so picking a
       * Dutch track on one film made Dutch the default on every title that
       * carried one - beating the English preference everywhere, quietly.
       */
      const chosen = prefs.subtitleChoices?.[delayKey];
      if (chosen && chosen !== 'off') {
        const exact = externalSubs.find(s => s.label === chosen);
        if (exact) {
          console.log(`[jellylab] player:subPick via=remembered picked=${exact.label}`);
          pickExternalSub(exact.index, false, 'prefs:remembered');
          return;
        }
      }
      /**
       * "Off" is a choice about one playback, not about every title.
       *
       * Tapping Off wrote a global 'off', and that suppressed the language
       * preference from then on - so subtitles silently stopped appearing
       * everywhere, with nothing in the log to say why. Off is recorded
       * against the title now, so it turns them off for the film you turned
       * them off in and nowhere else.
       */
      if (prefs.subtitleLanguage && prefs.subtitleLanguage !== 'off') {
        const match = pickSubtitle(externalSubs, prefs.subtitleLanguage);
        if (match) {
          console.log(`[jellylab] player:subPick via=language wanted=${prefs.subtitleLanguage} picked=${match.label}`);
          pickExternalSub(match.index, false, 'prefs:language');
        } else {
          console.log(`[jellylab] player:subPick via=language wanted=${prefs.subtitleLanguage} picked=none of ${externalSubs.length}`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Track active cue for external subs.
   *
   * Cues are looked up at `position - delay`, so a positive delay holds each
   * line back: at 12s of video with a 2s delay we show the line written for
   * 10s. This is the only place a timing correction can happen - VLC exposes
   * no subtitle-delay control, so it works on jellylab's own overlay, which is
   * also the path Jellyfin serves embedded tracks through.
   */
  useEffect(() => {
    if (externalCues.length === 0) {
      if (activeCue) setActiveCue(null);
      return;
    }
    const cue = findActiveCue(externalCues, position - subDelayMs / 1000);
    if (cue !== activeCue) setActiveCue(cue);
  }, [position, externalCues, activeCue, subDelayMs]);

  async function changeSubDelay(nextMs: number) {
    const clamped = Math.max(-30000, Math.min(30000, nextMs));
    setSubDelayMs(clamped);
    try {
      const prefs = prefsRef.current ?? (await loadPrefs());
      prefsRef.current = withSubtitleDelay(prefs, delayKey, clamped);
      await savePrefs(prefsRef.current);
    } catch {}
  }

  /**
   * VLC reports its own audio tracks in container order, which is the order
   * Jellyfin lists them in too, so its far richer DisplayTitle is matched to
   * VLC's track id by position. VLC's own name is the fallback for the case
   * where the two lists disagree in length.
   */
  function audioTrackLabel(track: { id: number; name?: string }, i: number): string {
    const fromJellyfin = audioStreams[i]?.label?.trim();
    if (fromJellyfin) return cleanSubLabel(fromJellyfin);
    const fromVlc = (track.name ?? '').trim();
    return fromVlc || `Track ${i + 1}`;
  }

  const audioChoices = vlcAudioTracks.map((track, i) => {
    // A file that never said what language it is in still has one, and the
    // servers know it - see lib/tracks.
    const language = resolvedTrackLanguage(
      audioStreams[i]?.language,
      originalLanguage,
      vlcAudioTracks.length,
    );
    return {
      id: track.id,
      label: withLanguage(
        audioTrackLabel(track, i),
        language ? t(`trackLanguages.${language}`, { defaultValue: '' }) : null,
      ),
      language: language ?? undefined,
    };
  });

  function applyAudioTrack(id: number, persist = true) {
    desiredAudioTrack.current = id;
    setVlcAudioTrackId(id);
    if (!persist) return;
    const picked = audioChoices.find(t => t.id === id);
    if (!picked) return;
    (async () => {
      try {
        const prefs = prefsRef.current ?? (await loadPrefs());
        prefsRef.current = withAudioChoice(prefs, delayKey, picked.label);
        await savePrefs(prefsRef.current);
      } catch {}
    })();
  }

  /**
   * Pick the audio track the user actually wants, once per playback.
   *
   * Anime is the case that forces this: a release commonly ships an English
   * dub first in the file, so the container default is the wrong language and
   * VLC happily plays it. Settings has had a "Preferred audio language" option
   * all along, but nothing read it - this is what makes it do something.
   */
  useEffect(() => {
    if (audioAutoPicked.current) return;
    if (!prefsLoaded || audioChoices.length < 2) return;
    audioAutoPicked.current = true;
    const prefs = prefsRef.current;
    if (!prefs) return;
    // What was chosen for THIS title, if anything. It was one label for the
    // whole library, which made a dub picked once the choice everywhere.
    const chosen = prefs.audioTrackChoices?.[delayKey];
    const byLastUsed = chosen
      ? audioChoices.find(t => t.label === chosen)
      : undefined;
    /**
     * The language comes resolved from the screen, so "original" is already a
     * real language by the time it gets here - Japanese for anime, French for
     * a French film - rather than a word this effect has to skip.
     */
    const byLanguage = preferredAudioLanguage
      ? audioChoices.find(t => matchesLanguage(t.language ?? t.label, preferredAudioLanguage))
      : undefined;
    const pick = byLastUsed ?? byLanguage;
    console.log(
      `[jellylab] player:audioPick wanted=${preferredAudioLanguage ?? 'none'}` +
      ` picked=${pick?.label ?? 'server default'}`,
    );
    // persist=false: an automatic choice should not overwrite what the user
    // last chose by hand, or every title would rewrite the preference.
    if (pick) applyAudioTrack(pick.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, vlcAudioTracks, preferredAudioLanguage]);

  /*
   * `why` is only for the log, and it is there because the log could not
   * answer the question it was asked: two sidecars were fetched for one
   * playback, one of them by something that leaves no other trace. A line that
   * says what was loaded but not who asked for it cannot settle that.
   */
  async function pickExternalSub(streamIndex: number | null, persistPref = true, why = 'unknown') {
    setActiveSubIndex(streamIndex);
    // Always disable VLC's internal track when we render an external overlay
    // (or when explicitly turning off), otherwise both would be drawn.
    // VLC ignores the textTrack prop when going from auto-selected -> -1,
    // so force a remount so it starts fresh with no internal subs.
    desiredTextTrack.current = -1;
    setVlcTextTrackId(-1);
    setReady(false);
    setVlcKey(k => k + 1);
    if (streamIndex == null || !mediaSourceId) {
      setExternalCues([]);
      setActiveCue(null);
      if (persistPref) {
        try {
          const prefs = await loadPrefs();
          const { savePrefs } = await import('@/store/prefs');
          prefsRef.current = withSubtitleChoice(prefs, delayKey, 'off');
          await savePrefs(prefsRef.current);
        } catch {}
      }
      return;
    }
    try {
      // A stored copy first: it is the one that exists with no network, and it
      // is identical to what the server would send.
      const offline = localSubtitleSync(itemId, streamIndex);
      if (offline) {
        const cues = parseVtt(offline);
        setExternalCues(cues);
        console.log(`[jellylab] player:externalSub via=${why} index=${streamIndex} stored cues=${cues.length}`);
        return;
      }

      const auth = await import('@/store/auth').then(m => m.loadJellyfinAuth());
      if (!auth) return;
      const url = Jellyfin.subtitleUrl(itemId, mediaSourceId, streamIndex, auth.accessToken, 'vtt');
      const vtt = await Jellyfin.fetchSubtitleVtt(url);
      const cues = parseVtt(vtt);
      setExternalCues(cues);
      // A track that fetches fine and parses to nothing looks exactly like one
      // that failed to fetch, and the two have different causes - so the log
      // says which happened, and how much came back.
      console.log(`[jellylab] player:externalSub via=${why} index=${streamIndex} bytes=${vtt.length} cues=${cues.length}`);
      if (persistPref) {
        const picked = externalSubs.find(s => s.index === streamIndex);
        if (picked) {
          try {
            const prefs = await loadPrefs();
            const { savePrefs } = await import('@/store/prefs');
            prefsRef.current = withSubtitleChoice(prefs, delayKey, picked.label);
            await savePrefs(prefsRef.current);
          } catch {}
        }
      }
    } catch (e) {
      logRequestFailure(`player:externalSub index=${streamIndex}`, e);
      setExternalCues([]);
    }
  }

  /**
   * Keep the resume point on the device as well as on the server.
   *
   * Jellyfin owns this normally, and offline there is nobody to tell - so a
   * stored item remembers where it got to itself, and the meta file is what
   * the item screen reads when there is no server to ask.
   */
  function rememberLocalPosition() {
    if (!localUriSync(itemId)) return;
    saveLocalPosition(itemId, Jellyfin.secondsToTicks(positionRef.current));
  }

  function pickInternalSub(trackId: number) {
    // Enable VLC internal track, clear any external overlay
    desiredTextTrack.current = trackId;
    setVlcTextTrackId(trackId);
    setActiveSubIndex(null);
    setExternalCues([]);
    setActiveCue(null);
  }


  // A drag that never ended would freeze position for good, so anything that
  // takes the controls away mid-gesture - an error, a rotation - ends it.
  useEffect(() => {
    if (!controlsVisible && scrubbing) setScrubbing(false);
  }, [controlsVisible, scrubbing]);

  /*
   * Auto-hide the controls.
   *
   * `position` used to be a dependency here, and that is why this never fired:
   * position changes on every progress tick, so the effect re-ran four times a
   * second, cleared the pending timer and started a new one. The controls
   * could not reach the timeout while the film was playing - which is the only
   * time they are meant to.
   *
   * What restarts the timer is the controls being shown again, which is what a
   * tap does. Not while scrubbing: a held scrubber would hide the controls
   * under the finger holding it, taking the Scrubber and the end of its
   * gesture with them.
   */
  useEffect(() => {
    if (!controlsVisible || paused || scrubbing) return;
    const t = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(t);
  }, [controlsVisible, paused, scrubbing]);

  function togglePlay() {
    setPaused(p => !p);
    setControlsVisible(true);
  }

  function vlcSeek(seconds: number) {
    if (duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, seconds / duration));
    lastSeekAt.current = Date.now();
    lastSeekTo.current = seconds;
    try {
      // react-native-vlc-media-player ref.seek takes a 0..1 percentage
      vlcRef.current?.seek?.(ratio);
    } catch {}
  }

  function skip(seconds: number) {
    const next = Math.max(0, Math.min(duration, position + seconds));
    vlcSeek(next);
    setPosition(next);
    setControlsVisible(true);
  }

  function seekTo(t: number) {
    vlcSeek(t);
    setPosition(t);
  }

  /**
   * The pickers are a route now, so opening one is: leave the payload, push.
   * The sheet closes itself once a choice is made, which is why none of these
   * callbacks says anything about closing.
   */
  /**
   * One picker for both lists, drawn over the film.
   *
   * The audio button and the subtitle button open the same thing: what you
   * hear beside what you read, so whichever you pressed the other is already
   * in front of you. Two buttons for one picker is on purpose - they are still
   * two intentions, and the overlay reads better with an ear and a speech
   * bubble than with one shared glyph.
   *
   * Not a route. Pushing one took the player off screen to answer a question
   * about the film that was playing, and left the glass with nothing to be
   * glass over.
   *
   * The film pauses while the picker is up. Reading nine track names takes
   * long enough to miss something, and a subtitle choice you cannot see
   * applied is worth less than the seconds it costs. Whether it was running is
   * remembered, so closing the picker over an already-paused film leaves it
   * paused.
   */
  function showTrackPicker() {
    resumeAfterPicker.current = !pausedRef.current;
    setPaused(true);
    setPickerOpen(true);
    // The controls go away with it. They sat behind the glass otherwise - a
    // play button and a scrubber showing through the list you were reading,
    // both belonging to something you had stepped away from.
    setControlsVisible(false);
  }

  function closeTrackPicker() {
    setPickerOpen(false);
    setControlsVisible(true);
    if (resumeAfterPicker.current) setPaused(false);
  }

  /*
   * Off, then whatever VLC found inside the file, then the sidecars.
   *
   * One tick, always. The overlay and VLC's own track are separate pieces of
   * state and on load both can be set for a moment: our overlay is chosen from
   * the saved preference while VLC reselects the container's default. An
   * external track wins, because that is the one being drawn.
   */
  const subtitleIsOff = activeSubIndex == null && vlcTextTrackId === -1;
  const vlcSubtitleRows: PickerRow[] = [
    {
      key: 'sub-off',
      label: t('player.off'),
      selected: subtitleIsOff,
      // pickExternalSub(null) already forces a remount with textTrack -1.
      onPick: () => pickExternalSub(null, true, 'user:off'),
    },
    ...vlcTextTracks.map((track, i) => ({
      key: `int-${track.id}`,
      label: cleanSubLabel(track.name ?? t('player.trackNumber', { number: track.id })),
      selected: activeSubIndex == null && vlcTextTrackId === track.id,
      onPick: () => pickInternalSub(track.id),
      group: i === 0 ? t('player.embedded') : undefined,
    })),
    ...externalSubs.map((sub, i) => ({
      key: `ext-${sub.index}`,
      label: cleanSubLabel(sub.label),
      selected: activeSubIndex === sub.index,
      onPick: () => pickExternalSub(sub.index, true, 'user:pick'),
      group: i === 0 ? t('player.external') : undefined,
    })),
  ];

  function showSpeedSheet() {
    openPlayerSheet({ kind: 'speed', current: rate, rates: SPEEDS, onPick: changeSpeed });
    router.push('/sheet/player');
  }

  function changeSpeed(nextRate: number) {
    setRate(nextRate);
  }

  async function toggleFullscreen() {
    setControlsVisible(true);
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      }
    } catch (e) {
      logRequestFailure('player:orientation', e);
    }
  }

  // Resume once loaded (initial resumeSeconds, or last position after remount)
  const onLoad = (e: any) => {
    setReady(true);
    const durSecs = (e?.duration ?? 0) / 1000;
    if (durSecs > 0) setDuration(durSecs);

    // Capture available internal text tracks from VLC.
    const rawTracks = Array.isArray(e?.textTracks) ? e.textTracks : [];
    console.log(`[jellylab] player:vlcTextTracks ${JSON.stringify(rawTracks)}`);
    const tracks = rawTracks.filter((t: any) => t && t.id != null && t.id !== -1);
    setVlcTextTracks(tracks);

    const rawAudio = Array.isArray(e?.audioTracks) ? e.audioTracks : [];
    console.log(`[jellylab] player:vlcAudioTracks ${JSON.stringify(rawAudio)}`);
    const audio = rawAudio.filter((t: any) => t && t.id != null && t.id !== -1);
    setVlcAudioTracks(audio);

    /**
     * Say which track is playing, even when nobody chose it.
     *
     * The picker ticks whatever `vlcAudioTrackId` holds, and that stayed at -1
     * until someone opened the picker and chose - so a file playing its own
     * default, which for these releases is the English dub, showed a list with
     * nothing ticked at all. VLC starts on the container's default, which is
     * the first track it reports.
     */
    if (vlcAudioTrackId === -1 && audio.length > 0) {
      setVlcAudioTrackId(audio[0].id);
    }

    // VLC only acts on textTrack/audioTrack when the prop *changes*, and a
    // fresh instance has already reselected the container's defaults by the
    // time it loads. Re-asserting the same value is therefore a no-op, so
    // every re-apply below ping-pongs through another value first.
    const reassert = (want: number, apply: (v: number) => void, via: number) => {
      setTimeout(() => {
        apply(via);
        setTimeout(() => apply(want), 80);
      }, 300);
    };

    if (vlcTextTrackId === -1 && tracks.length > 0) {
      // Subs should be off, but VLC autoplayed with a default embedded track:
      // the -1 from the initial render was silently ignored.
      reassert(-1, setVlcTextTrackId, tracks[0].id);
    } else if (desiredTextTrack.current !== -1 && tracks.some((t: any) => t.id === desiredTextTrack.current)) {
      // A remount had dropped the chosen embedded track, and the only way back
      // was to open the picker and select something else and then this one
      // again - which is exactly the ping-pong, done by hand.
      reassert(desiredTextTrack.current, setVlcTextTrackId, -1);
    }

    const wantAudio = desiredAudioTrack.current;
    if (wantAudio != null && audio.length > 1 && audio.some((t: any) => t.id === wantAudio)) {
      const other = audio.find((t: any) => t.id !== wantAudio)?.id ?? -1;
      reassert(wantAudio, setVlcAudioTrackId, other);
    }

    /*
     * Fallback for the start position, not the mechanism.
     *
     * `--start-time` on the media is what actually puts playback at the resume
     * point (see startAtRef). This stays because an option VLC declines to
     * honour for some container would otherwise put us back at zero silently -
     * but it only seeks when VLC is demonstrably not where it was asked to be,
     * so in the normal case nothing here fires and there is no jump to see.
     */
    const seekSecs = startAtRef.current;
    if (seekSecs > 0 && durSecs > 0) {
      const ratio = Math.max(0, Math.min(1, seekSecs / durSecs));
      setTimeout(() => {
        if (Math.abs(positionRef.current - seekSecs) < 2) return;
        try {
          lastSeekAt.current = Date.now();
          lastSeekTo.current = seekSecs;
          vlcRef.current?.seek?.(ratio);
        } catch {}
      }, 200);
    }
    /*
     * Hold the pause across a reattach.
     *
     * This called `vlcRef.current?.pause?.()`, and there is no pause() on that
     * ref - the API is resume(isResume). Optional chaining onto a method that
     * does not exist fails silently, so nothing paused: coming back to a
     * paused film rebuilt the player and started it playing while the controls
     * still showed a pause button. The UI was not wrong about what it had been
     * asked; nothing had carried the request through.
     */
    if (paused) {
      setTimeout(() => {
        try { vlcRef.current?.resume?.(false); } catch {}
      }, 300);
    }
  };

  const onProgress = (e: any) => {
    if (scrubbing) return;
    const cur = (e?.currentTime ?? 0) / 1000;
    const dur = (e?.duration ?? 0) / 1000;
    /*
     * Ignore progress right after a seek - VLC briefly reports 0 while it
     * catches up - but only until it reports somewhere near where the seek was
     * going. Waiting the window out regardless froze `position`, and with it
     * the subtitle overlay, which is driven off it.
     *
     * Coming back from the background is the case that showed it: that seek
     * goes to where the film already is, so VLC is back within a frame or two,
     * and the old code still spent the rest of the 1500ms playing under a line
     * that had already ended.
     */
    if (Date.now() - lastSeekAt.current < 1500 && Math.abs(cur - lastSeekTo.current) > 2) return;
    if (dur > 0) setDuration(dur);
    // Ignore a stray 0 when we know we were much further in.
    if (cur < 0.5 && position > 5) return;
    setPosition(cur);
    if (seekTarget != null && Math.abs(cur - seekTarget) < 2) setSeekTarget(null);
  };

  return (
    <>
      <StatusBar hidden />
      <View style={{ flex: 1 }}>
        <VLCPlayer
          key={vlcKey}
          ref={vlcRef}
          style={{ flex: 1 }}
          source={{ uri: url, initOptions }}
          autoplay
          paused={paused}
          rate={rate}
          textTrack={vlcTextTrackId}
          audioTrack={vlcAudioTrackId >= 0 ? vlcAudioTrackId : undefined}
          resizeMode="contain"
          playInBackground={false}
          onLoad={onLoad}
          onProgress={onProgress}
          onEnd={onEnded ?? onExit}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setControlsVisible(v => !v)}
        />
        {!ready ? (
          <View style={styles.vlcLoading} pointerEvents="none">
            <ActivityIndicator color={colors.text} size="large" />
          </View>
        ) : null}
        {/*
          * Not while the picker is up.
          *
          * The line was drawn under the panel and read straight through it -
          * dialogue crossing the middle of a list of track names, from a film
          * you had stepped away from. Same reasoning as the controls.
          */}
        {activeCue && !pickerOpen ? (
          <View style={styles.subOverlay} pointerEvents="none">
            <Text style={[styles.subText, { fontSize: subFontSize, lineHeight: subFontSize + 6 }]}>
              {activeCue.text}
            </Text>
          </View>
        ) : null}
        <Animated.View
          style={[styles.overlay, { opacity: controlsFade }]}
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
        >
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.8)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.overlayTop} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.overlayIconBtn}
                onPress={onExit}
                activeOpacity={0.7}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={colors.text} size={22} />
              </TouchableOpacity>
              <Text style={styles.overlayTitle} numberOfLines={1}>{title}</Text>
            </View>

            <View style={styles.overlayCenter} pointerEvents="box-none">
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(-10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.playPauseBtn} onPress={togglePlay} activeOpacity={0.7}>
                <SymbolView
                  name={{ ios: paused ? 'play.fill' : 'pause.fill', android: 'play_arrow', web: 'play_arrow' }}
                  tintColor={colors.text}
                  size={44}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
            </View>

            <View style={styles.overlayBottomWrap} pointerEvents="box-none">
              <View style={styles.scrubRow} pointerEvents="box-none">
                <Text style={styles.timeText}>{formatTime(scrubbing ? scrubValue : position)}</Text>
                <Scrubber
                  position={scrubbing ? scrubValue : position}
                  duration={duration}
                  trickplay={trickplay ? { itemId, info: trickplay.info, token: trickplay.token } : null}
                  onScrubStart={() => setScrubbing(true)}
                  onScrub={(t) => setScrubValue(t)}
                  onScrubEnd={(t) => {
                    seekTo(t);
                    setScrubbing(false);
                    setControlsVisible(true);
                  }}
                />
                <Text style={styles.timeText}>
                  -{formatTime(Math.max(0, duration - (scrubbing ? scrubValue : position)))}
                </Text>
              </View>
              <View style={styles.actionsRow} pointerEvents="box-none">
                <View style={{ flex: 1 }} />
                {audioChoices.length > 1 ? (
                  <TouchableOpacity style={styles.overlayIconBtn} onPress={showTrackPicker} activeOpacity={0.7}>
                    <SymbolView name={{ ios: 'waveform', android: 'graphic_eq', web: 'graphic_eq' }} tintColor={colors.text} size={22} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showTrackPicker} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'captions.bubble', android: 'closed_caption', web: 'closed_caption' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showSpeedSheet} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                {/*
                  * Present but dimmed, and it explains itself.
                  *
                  * VLC has no picture in picture, so this engine simply had no
                  * such button - which reads as the feature being broken
                  * rather than absent, especially on a library that is mostly
                  * mkv and therefore mostly VLC.
                  */}
                <TouchableOpacity
                  style={styles.overlayIconBtn}
                  onPress={() => Alert.alert(t('player.pipUnavailable'), t('player.pipUnavailableBody'))}
                  activeOpacity={0.7}
                >
                  <SymbolView
                    name={{ ios: 'pip.enter', android: 'picture_in_picture_alt', web: 'picture_in_picture_alt' }}
                    tintColor={colors.textDim}
                    size={22}
                  />
                </TouchableOpacity>
                {/*
                  * Only where there is something to toggle.
                  *
                  * A phone plays landscape and nothing else - the screen says
                  * so - which leaves this button unable to do the one thing it
                  * offers. Netflix does not draw it either; the video is
                  * fullscreen and that is the whole of it.
                  */}
                {IS_TABLET ? (
                  <TouchableOpacity style={styles.overlayIconBtn} onPress={toggleFullscreen} activeOpacity={0.7}>
                    <SymbolView
                      name={{
                        ios: isLandscape ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right',
                        android: 'fullscreen',
                        web: 'fullscreen',
                      }}
                      tintColor={colors.text}
                      size={22}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
        </Animated.View>
        {pickerOpen ? (
          <TrackPicker
            onClose={closeTrackPicker}
            audio={audioChoices.map(track => ({
              key: `aud-${track.id}`,
              label: track.label,
              selected: vlcAudioTrackId === track.id,
              onPick: () => applyAudioTrack(track.id),
            }))}
            audioNote={
              audioStreams.length > audioChoices.length && audioChoices.length > 0
                ? t('player.transcodedAudio', { tracks: audioStreams.length })
                : null
            }
            subtitles={vlcSubtitleRows}
            timing={{
              delayMs: subDelayMs,
              enabled: externalCues.length > 0,
              onChange: changeSubDelay,
            }}
          />
        ) : null}
      </View>
    </>
  );
}
