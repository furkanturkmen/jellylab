import { useEffect } from 'react';
import { View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

import { IS_TABLET } from '@/lib/device';
import { type PlaybackConfig } from '@/player/config';
import { NativePlayer } from '@/player/NativePlayer';
import { styles } from '@/player/styles';
import { VLCEnginePlayer } from '@/player/VLCEnginePlayer';

/**
 * Which engine plays this, and the orientation both of them sit inside.
 *
 * Small on purpose: everything it knows is which of the two to render and what
 * to hand them. The choosing itself is player/decide, tested separately.
 */

export function Player({
  config,
  onSwitchAudio,
  onEnded,
  itemId,
  delayKey,
  title,
  subtitle,
  artworkUri,
  resumeSeconds,
  initialDuration,
  onExit,
  onNativeError,
}: {
  config: PlaybackConfig;
  /** Called with a Jellyfin stream index when the audio track should change. */
  onSwitchAudio: (streamIndex: number, positionSeconds: number) => void;
  itemId: string;
  /** what a subtitle offset is remembered against: the series, or the film */
  delayKey: string;
  title: string;
  /** Second line on the lock screen: series and episode, or the year. */
  subtitle?: string;
  /** Poster for the lock screen and Control Centre. */
  artworkUri?: string;
  resumeSeconds: number;
  initialDuration: number;
  onExit: () => void;
  /** The file reached its end, as opposed to the viewer leaving. */
  onEnded?: () => void;
  onNativeError: () => void;
}) {
  /*
   * Orientation for the length of playback, and portrait again on the way out.
   *
   * A phone turns to landscape by itself, the way every video app does it -
   * portrait video on a handset is a compromise nobody asks for, and starting
   * the film sideways saves the turn that everybody makes anyway. The button
   * in the controls still goes back, so this is a default rather than a rule.
   *
   * A tablet is left alone: an iPad in portrait has the width to show a film
   * properly, and people genuinely watch that way.
   */
  useEffect(() => {
    /*
     * Nothing to lock on a phone: the screen itself declares landscape, so iOS
     * puts it there and keeps it there across backgrounding. A JS lock was
     * what made the film rotate in front of you on every return, since the
     * lock is dropped while the app is away and re-applied once it is back and
     * visible.
     *
     * A tablet is unlocked so both ways round remain available.
     */
    if (IS_TABLET) {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
    return () => {
      // The rest of the app is portrait, and the screen behind this one does
      // not declare an orientation of its own.
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  return (
    <View style={styles.playerContainer}>
      {config.engine === 'native' ? (
        <NativePlayer
          delayKey={delayKey}
          url={config.url}
          itemId={itemId}
          mediaSourceId={config.mediaSourceId}
          externalSubs={config.externalSubs}
          audioStreams={config.audioStreams}
          activeAudioStreamIndex={config.audioStreamIndex}
          originalLanguage={config.originalLanguage}
          onSwitchAudio={config.mode === 'transcode' ? onSwitchAudio : undefined}
          title={title}
          subtitle={subtitle}
          artworkUri={artworkUri}
          resumeSeconds={resumeSeconds}
          playMethod={config.mode === 'transcode' ? 'Transcode' : 'DirectPlay'}
          trickplay={config.trickplay}
          onEnded={onEnded}
          onError={onNativeError}
          onExit={onExit}
        />
      ) : (
        <VLCEnginePlayer
          preferredAudioLanguage={config.preferredAudioLanguage}
          originalLanguage={config.originalLanguage}
          url={config.url}
          itemId={itemId}
          mediaSourceId={config.mediaSourceId}
          externalSubs={config.externalSubs}
          audioStreams={config.audioStreams}
          delayKey={delayKey}
          title={title}
          resumeSeconds={resumeSeconds}
          initialDuration={initialDuration}
          playMethod={config.mode === 'transcode' ? 'Transcode' : 'DirectPlay'}
          trickplay={config.trickplay}
          onEnded={onEnded}
          onExit={onExit}
        />
      )}
    </View>
  );
}
