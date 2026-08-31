import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { Scrubber, formatTime } from '@/components/Scrubber';
import { TrackPicker, type PickerRow } from '@/components/TrackPicker';
import { IS_TABLET } from '@/lib/device';
import { logRequestFailure } from '@/lib/errorLog';
import { resolvedTrackLanguage, withLanguage } from '@/lib/tracks';
import { type TrickplayInfo } from '@/lib/trickplay';
import { CONTROLS_HIDE_MS, SPEEDS, type AudioStream } from '@/player/config';
import { pickSubtitle } from '@/player/lang';
import { styles } from '@/player/styles';
import { useProgressReporting } from '@/player/useProgressReporting';
import { parseVtt, findActiveCue, type VttCue } from '@/player/vtt';
import { useSmoothPosition } from '@/player/useSmoothPosition';
import { saveLocalPosition } from '@/store/downloads';
import { openPlayerSheet } from '@/store/playerSheet';
import { loadPrefs, savePrefs, withSubtitleChoice, withSubtitleDelay } from '@/store/prefs';
import { colors } from '@/theme';

/**
 * Playback through AVPlayer, for the containers iOS opens natively.
 *
 * The other half of the pair split out of the item screen; see
 * player/VLCEnginePlayer for why they are two files. This one reads its
 * position from the player object rather than from progress events, and has no
 * subtitle timing control - its overlay is drawn straight off the player clock.
 */

export function NativePlayer({ url, itemId, mediaSourceId, externalSubs, audioStreams, activeAudioStreamIndex, onSwitchAudio, originalLanguage, delayKey, title, subtitle, artworkUri, resumeSeconds, playMethod = 'DirectPlay', trickplay, onEnded, onError, onExit }: {
  url: string;
  itemId: string;
  mediaSourceId?: string;
  /** Series id, or item id for a film - what a remembered subtitle is filed under. */
  delayKey: string;
  externalSubs: { index: number; label: string }[];
  /** The server's audio tracks - the only list that means anything on a transcode. */
  audioStreams?: AudioStream[];
  activeAudioStreamIndex?: number | null;
  /** Set only when transcoding: switching means a new stream from the server. */
  onSwitchAudio?: (streamIndex: number, positionSeconds: number) => void;
  /** What the title was made in - names a track the file left untagged. */
  originalLanguage?: string;
  title: string;
  subtitle?: string;
  artworkUri?: string;
  resumeSeconds: number;
  playMethod?: Jellyfin.PlayMethod;
  /** Scrub previews, with the token needed to fetch a sheet. */
  trickplay?: { info: TrickplayInfo; token: string } | null;
  /** The file reached its end, as opposed to the viewer leaving. */
  onEnded?: () => void;
  onError: () => void;
  onExit: () => void;
}) {
  // metadata belongs to the source rather than the player: it describes this
  // video, not the thing playing it.
  const router = useRouter();
  const source = { uri: url, metadata: { title, artist: subtitle, artwork: artworkUri } };
  const player = useVideoPlayer(source, p => {
    if (resumeSeconds > 0) {
      try { p.currentTime = resumeSeconds; } catch {}
    }
    /**
     * Hand the system what it needs to run the lock screen.
     *
     * Locking the phone mid-episode used to stop everything and show nothing:
     * no artwork, no controls, no AirPods play/pause, and the audio cut with
     * the screen. iOS will do all of that itself, given a title, an artwork URL
     * and permission to keep running - which is the UIBackgroundModes audio
     * entry added to app.json alongside this.
     *
     * The VLC engine has no equivalent, so mkv playback keeps behaving as
     * before. That is most of the anime library, and worth knowing.
     */
    p.showNowPlayingNotification = true;
    p.staysActiveInBackground = true;
    p.play();
  });

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
  const resumeAfterPicker = useRef(false);
  // AVPlayer publishes its track lists as properties, not events, so they are
  // read when the picker opens rather than watched.
  const [nativeSubs, setNativeSubs] = useState<any[]>([]);
  const [nativeAudios, setNativeAudios] = useState<any[]>([]);
  const [playing, setPlaying] = useState(true);
  /*
   * Starts where the film starts, not at zero.
   *
   * Nothing was wrong with the resume itself - the picture was already at the
   * right frame. This is the clock and the scrubber, which learn the position
   * from the first progress tick and so read 0:00 for a quarter of a second
   * before jumping to it. Seeded, they are right from the first paint.
   */
  const [position, setPosition] = useState(resumeSeconds);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  // Read off the window rather than remembered. A lock set at mount, a
  // rotation, or the system overriding either one all show up here, whereas a
  // remembered flag starts out disagreeing with the screen - which made the
  // first press of the fullscreen button do nothing at all.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isLandscape = winWidth > winHeight;
  const [speed, setSpeed] = useState(1);
  const [activeSubIndex, setActiveSubIndex] = useState<number | null>(null);
  const [externalCues, setExternalCues] = useState<VttCue[]>([]);
  const [activeCue, setActiveCue] = useState<VttCue | null>(null);
  /**
   * How far to shift the subtitle overlay, in milliseconds.
   *
   * This engine drew the overlay itself and then ignored the offset: the
   * control was hidden, and the saved value was read only to be printed in the
   * log as "(ignored)". A correction made while watching an mkv silently did
   * nothing the moment the next title happened to be an mp4.
   */
  const [subDelayMs, setSubDelayMs] = useState(0);
  const [subFontSize, setSubFontSize] = useState(18);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => sub.remove();
  }, [player, onError]);

  // The end of the file. VLC has always reported this; AVPlayer was never
  // asked, so an episode finishing here did nothing at all.
  useEffect(() => {
    if (!onEnded) return;
    const sub = player.addListener('playToEnd', () => onEnded());
    return () => sub.remove();
  }, [player, onEnded]);

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
      // Fire an immediate progress ping when pause/resume toggles
      try {
        Jellyfin.reportPlaybackProgress(itemId, Jellyfin.secondsToTicks(player.currentTime ?? 0), !isPlaying, playMethod).catch(() => {});
      } catch {}
    });
    return () => sub.remove();
  // Resubscribing on a playMethod change would drop the listener mid-playback,
  // which is the moment it matters most.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, itemId]);

  // Apply pref-based subtitle size + auto-select preferred language sub on mount.
  useEffect(() => {
    (async () => {
      const prefs = await loadPrefs();
      // Remembered per title, like the track choice beside it.
      setSubDelayMs(prefs.subtitleDelays?.[delayKey] ?? 0);
      const sizeMap = { sm: 14, md: 18, lg: 24 } as const;
      setSubFontSize(sizeMap[prefs.subtitleSize] ?? 18);

      // 1. Prefer exact match on the last-picked label (persisted across sessions).
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
          // pickExternalSub is a function declaration below, so it is hoisted.
          // eslint-disable-next-line react-hooks/immutability
          pickExternalSub(exact.index, /* persistPref */ false, 'prefs:remembered');
          return;
        }
      }

      /**
       * 2. Fall back to the language preference.
       *
       * This used its own copy of the alias table and matched by plain
       * substring, which is the bug `matchesLanguage` exists to avoid: "en" is
       * inside "French", so a French track could be chosen for someone who
       * asked for English. The VLC path was fixed and this one kept the old
       * copy, so the two engines disagreed about which subtitle to pick.
       *
       * Both call `pickSubtitle` now, which is also where the choice between
       * several tracks in the same language is made - so a fix to either lands
       * on both engines, which is the half that went wrong last time.
       */
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
          pickExternalSub(match.index, /* persistPref */ false, 'prefs:language');
        } else {
          console.log(`[jellylab] player:subPick via=language wanted=${prefs.subtitleLanguage} picked=none of ${externalSubs.length}`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The same reporting the VLC engine uses - see player/useProgressReporting.
  useProgressReporting({
    itemId,
    playMethod,
    resumeSeconds,
    paused: !playing,
    positionAt: () => player.currentTime ?? 0,
    onStop: ticks => saveLocalPosition(itemId, ticks),
  });

  // Periodic progress ping every 15s.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        Jellyfin.reportPlaybackProgress(
          itemId,
          Jellyfin.secondsToTicks(player.currentTime ?? 0),
          !playing,
          playMethod,
        ).catch(() => {});
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  // Same listener, same reason.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, itemId, playing]);

  useEffect(() => {
    const id = setInterval(() => {
      if (scrubbing) return;
      try {
        setPosition(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);
      } catch {}
    }, 250);
    return () => clearInterval(id);
  }, [player, scrubbing]);

  /*
   * The overlay runs off an interpolated clock rather than the 250ms poll.
   *
   * Sampling four times a second put a cue up to a quarter-second behind the
   * audio, and always behind - a sample can only say where the playhead was.
   * The position advances at a known rate between samples, so it is arithmetic
   * rather than another thing to ask the player for.
   */
  const smoothPosition = useSmoothPosition(position, playing && !scrubbing, speed);

  useEffect(() => {
    if (externalCues.length === 0) {
      // Follows the player: no cues means no active cue to draw.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (activeCue) setActiveCue(null);
      return;
    }
    // Subtracting moves the cue later, which is the direction a positive
    // offset means to a viewer. Same arithmetic as the VLC path.
    const cue = findActiveCue(externalCues, smoothPosition - subDelayMs / 1000);
    if (cue !== activeCue) setActiveCue(cue);
  }, [smoothPosition, externalCues, activeCue, subDelayMs]);

  // A drag that never ended would freeze position for good, so anything that
  // takes the controls away mid-gesture - an error, a rotation - ends it.
  useEffect(() => {
    // Ends a drag the controls disappeared out from under. See the comment above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!controlsVisible && scrubbing) setScrubbing(false);
  }, [controlsVisible, scrubbing]);

  // Auto-hide the controls - see the VLC engine for why `position` is not a
  // dependency here, and was the reason this never fired.
  useEffect(() => {
    if (!controlsVisible || !playing || scrubbing) return;
    const t = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(t);
  }, [controlsVisible, playing, scrubbing]);

  function togglePlay() {
    if (playing) player.pause();
    else player.play();
    setControlsVisible(true);
  }

  function skip(seconds: number) {
    try {
      const next = Math.max(0, Math.min(duration, (player.currentTime ?? 0) + seconds));
      // expo-video exposes playback position as a settable property.
      // eslint-disable-next-line react-hooks/immutability
      player.currentTime = next;
      setPosition(next);
      setControlsVisible(true);
    } catch {}
  }

  function seekTo(t: number) {
    try {
      // Same setter.
      // eslint-disable-next-line react-hooks/immutability
      player.currentTime = t;
      setPosition(t);
    } catch {}
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

  const { t } = useTranslation();
  const viewRef = useRef<VideoView>(null);

  /**
   * Picture in picture belongs to the view, not the player.
   *
   * `player.startPictureInPicture` does not exist, so the button called
   * nothing at all. The method is on the VideoView's ref, and it only works in
   * a binary built with the expo-video plugin's supportsPictureInPicture -
   * which is why app.json changed alongside this.
   */
  function togglePip() {
    viewRef.current?.startPictureInPicture().catch(e => logRequestFailure('player:pip', e));
  }

  /** Same handoff as the VLC player's, with the live player object attached. */
  /**
   * The picker, over the film rather than pushed as a route.
   *
   * Same reasoning as the VLC engine next door, and deliberately the same
   * component: these two pickers drifted apart once before, when only one of
   * them was fixed.
   *
   * The film pauses while it is up and goes back to what it was doing after.
   */
  function showTrackPicker() {
    setNativeSubs(player?.availableSubtitleTracks ?? []);
    setNativeAudios(player?.availableAudioTracks ?? []);
    resumeAfterPicker.current = !!player?.playing;
    try { player.pause(); } catch {}
    setPickerOpen(true);
    // The controls go away with it - see the VLC engine.
    setControlsVisible(false);
  }

  /** Clamped to the same half minute either way as the VLC path. */
  async function changeSubDelay(nextMs: number) {
    const clamped = Math.max(-30000, Math.min(30000, nextMs));
    setSubDelayMs(clamped);
    try {
      const prefs = await loadPrefs();
      await savePrefs(withSubtitleDelay(prefs, delayKey, clamped));
    } catch {}
  }

  function closeTrackPicker() {
    setPickerOpen(false);
    setControlsVisible(true);
    if (resumeAfterPicker.current) {
      try { player.play(); } catch {}
    }
  }

  function pickEmbeddedSub(track: any | null) {
    try {
      // Same, for the embedded subtitle track.
      // eslint-disable-next-line react-hooks/immutability
      player.subtitleTrack = track;
      // An embedded track replaces the overlay, and vice versa.
      if (track) pickExternalSub(null, true, 'embedded-wins');
    } catch {}
  }

  const activeNativeSub = player?.subtitleTrack ?? null;
  const activeNativeAudio = player?.audioTrack ?? null;

  const nativeSubtitleRows: PickerRow[] = [
    {
      key: 'sub-off',
      label: t('player.off'),
      selected: !activeNativeSub && activeSubIndex == null,
      onPick: () => { pickExternalSub(null, true, 'user:off'); pickEmbeddedSub(null); },
    },
    ...nativeSubs.map((track: any, i: number) => ({
      key: `emb-${i}`,
      label: track.label ?? track.language ?? t('player.trackNumber', { number: i + 1 }),
      selected: !!activeNativeSub && (activeNativeSub.id === track.id || activeNativeSub.label === track.label),
      onPick: () => pickEmbeddedSub(track),
      group: i === 0 ? t('player.embedded') : undefined,
    })),
    ...externalSubs.map((sub, i) => ({
      key: `ext-${sub.index}`,
      label: sub.label,
      selected: activeSubIndex === sub.index,
      onPick: () => { pickEmbeddedSub(null); pickExternalSub(sub.index, true, 'user:pick'); },
      group: i === 0 ? t('player.external') : undefined,
    })),
  ];

  /*
   * On a transcode the file carries one audio track and AVPlayer has nothing
   * to switch between, so the server's list is the real one: choosing from it
   * asks for a new stream, resumed where this one is.
   */
  const nativeAudioRows: PickerRow[] = onSwitchAudio
    ? (audioStreams ?? []).map(track => {
        const language = resolvedTrackLanguage(track.language, originalLanguage, (audioStreams ?? []).length);
        return {
          key: `srv-${track.index}`,
          label: withLanguage(track.label, language ? t(`trackLanguages.${language}`, { defaultValue: '' }) : null),
          selected: activeAudioStreamIndex === track.index,
          onPick: () => onSwitchAudio(track.index, player.currentTime ?? 0),
        };
      })
    : nativeAudios.map((track: any, i: number) => ({
        key: `aud-${i}`,
        // AVPlayer reports what the file says, and this file says nothing.
        // The title's own language is a better answer than "Track 1".
        label: withLanguage(
          track.label ?? t('player.trackNumber', { number: i + 1 }),
          (() => {
            const lang = resolvedTrackLanguage(track.language, originalLanguage, nativeAudios.length);
            return lang ? t(`trackLanguages.${lang}`, { defaultValue: '' }) : null;
          })(),
        ),
        /*
         * With one track, that track is what you are hearing - AVPlayer has
         * simply not reported a selection yet, and a list with nothing ticked
         * reads as broken.
         */
        selected:
          nativeAudios.length === 1 ||
          (!!activeNativeAudio && (activeNativeAudio.id === track.id || activeNativeAudio.label === track.label)),
        onPick: () => {
          try { player.audioTrack = track; } catch {}
        },
      }));

  function showSpeedSheet() {
    openPlayerSheet({ kind: 'speed', current: speed, rates: SPEEDS, onPick: changeSpeed });
    router.push('/sheet/player');
  }

  function changeSpeed(rate: number) {
    try {
      // Same, for playback rate.
      // eslint-disable-next-line react-hooks/immutability
      player.playbackRate = rate;
      setSpeed(rate);
    } catch {}
  }

  /*
   * `why` is only for the log, and it is there because the log could not
   * answer the question it was asked: two sidecars were fetched for one
   * playback, one of them by something that leaves no other trace. A line that
   * says what was loaded but not who asked for it cannot settle that.
   */
  async function pickExternalSub(streamIndex: number | null, persistPref = true, why = 'unknown') {
    setActiveSubIndex(streamIndex);
    if (streamIndex == null || !mediaSourceId) {
      // Ticking the row while quietly clearing the cues is the shape of "the
      // subtitle is selected and nothing appears", so say which it was.
      console.log(`[jellylab] player:externalSub via=${why} index=${streamIndex} skipped source=${mediaSourceId ?? 'missing'}`);
      setExternalCues([]);
      setActiveCue(null);
      if (persistPref) {
        try {
          const prefs = await loadPrefs();
          const { savePrefs } = await import('@/store/prefs');
          await savePrefs(withSubtitleChoice(prefs, delayKey, 'off'));
        } catch {}
      }
      return;
    }
    try {
      const auth = await import('@/store/auth').then(m => m.loadJellyfinAuth());
      if (!auth) return;
      const url = Jellyfin.subtitleUrl(itemId, mediaSourceId, streamIndex, auth.accessToken, 'vtt');
      const vtt = await Jellyfin.fetchSubtitleVtt(url);
      const cues = parseVtt(vtt);
      console.log(`[jellylab] player:externalSub via=${why} index=${streamIndex} bytes=${vtt.length} cues=${cues.length}`);
      setExternalCues(cues);

      if (persistPref) {
        const picked = externalSubs.find(s => s.index === streamIndex);
        if (picked) {
          try {
            const prefs = await loadPrefs();
            const { savePrefs } = await import('@/store/prefs');
            await savePrefs(withSubtitleChoice(prefs, delayKey, picked.label));
          } catch {}
        }
      }
    } catch {
      setExternalCues([]);
    }
  }

  return (
    <>
      <StatusBar hidden />
      <View style={{ flex: 1 }}>
        <VideoView
          ref={viewRef}
          player={player}
          style={{ flex: 1 }}
          fullscreenOptions={{ enable: true, autoExitOnRotate: false }}
          allowsPictureInPicture
          // What people mean by picture in picture: swipe home and the video
          // carries on in a corner. The button is the explicit version of the
          // same thing.
          startsPictureInPictureAutomatically
          nativeControls={false}
          contentFit="contain"
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setControlsVisible(v => !v)}
        />
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

            {/* Top bar */}
            <View style={styles.overlayTop} pointerEvents="box-none">
              <TouchableOpacity style={styles.overlayIconBtn} onPress={onExit} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={colors.text} size={22} />
              </TouchableOpacity>
              <Text style={styles.overlayTitle} numberOfLines={1}>{title}</Text>
            </View>

            {/* Center controls */}
            <View style={styles.overlayCenter} pointerEvents="box-none">
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(-10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'gobackward.10', android: 'replay_10', web: 'replay_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.playPauseBtn} onPress={togglePlay} activeOpacity={0.7}>
                <SymbolView
                  name={{ ios: playing ? 'pause.fill' : 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                  tintColor={colors.text}
                  size={44}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={() => skip(10)} activeOpacity={0.7}>
                <SymbolView name={{ ios: 'goforward.10', android: 'forward_10', web: 'forward_10' }} tintColor={colors.text} size={38} />
              </TouchableOpacity>
            </View>

            {/* Bottom: scrubber + action cluster */}
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
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showTrackPicker} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'captions.bubble', android: 'closed_caption', web: 'closed_caption' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={showSpeedSheet} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={colors.text} size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.overlayIconBtn} onPress={togglePip} activeOpacity={0.7}>
                  <SymbolView name={{ ios: 'pip.enter', android: 'picture_in_picture_alt', web: 'picture_in_picture_alt' }} tintColor={colors.text} size={22} />
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
            audio={nativeAudioRows}
            audioNote={nativeAudioRows.length === 0 ? t('player.noAlternateAudio') : null}
            subtitles={nativeSubtitleRows}
            /*
             * Offered exactly when there is something to shift.
             *
             * An embedded AVPlayer track cannot be moved - that half of the
             * old reasoning holds - but the overlay this engine draws for
             * external cues can, and that is the case the control exists for.
             * Hiding it whenever the file happened to be an mp4 made a
             * correction that worked on one title do nothing on the next.
             */
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
