import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { cleanSubLabel, DelayButton, SubGroupLabel, TrackRow } from '@/components/TrackRow';
import { clearPlayerSheet, pendingPlayerSheet, type PlayerSheetRequest } from '@/store/playerSheet';
import { resolvedTrackLanguage, withLanguage } from '@/lib/tracks';
import { colors, spacing, type } from '@/theme';

/**
 * The player's pickers: subtitles, audio, tracks, speed.
 *
 * All four were Modals inside the player, each drawing its own backdrop, its
 * own grabber and its own Close button. As one `formSheet` route they get the
 * card, the grabber and drag-to-dismiss from UIKit, and a height that fits
 * their contents - which matters here, where a speed picker is five rows and a
 * subtitle list can be twenty.
 *
 * One route rather than four: only one can be open over a playing video, and
 * the payload in `store/playerSheet` says which.
 */
export default function PlayerSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Read once. The player writes before it pushes, and a later write is a
  // different opening of the sheet.
  const request = useMemo(() => pendingPlayerSheet(), []);

  useEffect(() => {
    if (!request) router.back();
    return () => clearPlayerSheet();
  }, [request, router]);

  if (!request) return null;

  /*
   * The scroller is the sheet itself - see the seasons sheet for why. Padding
   * rides on the content so the card is measured from what it holds.
   */
  const pad = [styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }];

  return (
    <ScrollView style={styles.root} contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
      {request.kind === 'vlcSubtitles' ? <VlcSubtitles request={request} close={router.back} /> : null}
      {request.kind === 'vlcAudio' ? <VlcAudio request={request} close={router.back} /> : null}
      {request.kind === 'tracks' ? <NativeTracks request={request} close={router.back} /> : null}
      {request.kind === 'speed' ? <Speed request={request} close={router.back} /> : null}
    </ScrollView>
  );
}

type Of<K extends PlayerSheetRequest['kind']> = Extract<PlayerSheetRequest, { kind: K }>;

function VlcSubtitles({ request, close }: { request: Of<'vlcSubtitles'>; close: () => void }) {
  const { t } = useTranslation();
  // The delay is adjusted from in here and applied as it changes, so the sheet
  // keeps its own copy rather than reading a value that no longer updates.
  const [delayMs, setDelayMs] = useState(request.subDelayMs);
  const isOff = request.activeExternalIndex == null && request.activeInternalId === -1;

  function changeDelay(ms: number) {
    setDelayMs(ms);
    request.onDelayChange(ms);
  }

  return (
    <>
      <Text style={styles.title}>{t('player.subtitles')}</Text>
        {request.externalSubs.length === 0 && request.internalTracks.length === 0 ? (
          <Text style={styles.empty}>{t('player.noSubtitles')}</Text>
        ) : (
          <>
            <TrackRow label={t('player.off')} selected={isOff} onPress={() => { request.onOff(); close(); }} />
            {request.internalTracks.length > 0 ? <SubGroupLabel>{t('player.embedded')}</SubGroupLabel> : null}
            {request.internalTracks.map(track => (
              <TrackRow
                key={`int-${track.id}`}
                label={cleanSubLabel(track.name ?? t('player.trackNumber', { number: track.id }))}
                selected={request.activeInternalId === track.id}
                onPress={() => { request.onPickInternal(track.id); close(); }}
              />
            ))}
            {request.externalSubs.length > 0 ? <SubGroupLabel>{t('player.external')}</SubGroupLabel> : null}
            {request.externalSubs.map(s => (
              <TrackRow
                key={`ext-${s.index}`}
                label={cleanSubLabel(s.label)}
                selected={request.activeExternalIndex === s.index}
                onPress={() => { request.onPickExternal(s.index); close(); }}
              />
            ))}
          </>
        )}
        <View style={styles.delayBlock}>
        <View style={styles.delayHeader}>
          <Text style={styles.delayLabel}>{t('player.timing')}</Text>
          <Text style={styles.delayValue}>
            {delayMs === 0 ? t('player.inSync') : `${delayMs > 0 ? '+' : ''}${(delayMs / 1000).toFixed(1)}s`}
          </Text>
        </View>
        <View style={styles.delayRow}>
          <DelayButton label="-0.5s" disabled={!request.delayEnabled} onPress={() => changeDelay(delayMs - 500)} />
          <DelayButton label="-0.1s" disabled={!request.delayEnabled} onPress={() => changeDelay(delayMs - 100)} />
          <DelayButton label={t('player.reset')} disabled={!request.delayEnabled || delayMs === 0} onPress={() => changeDelay(0)} />
          <DelayButton label="+0.1s" disabled={!request.delayEnabled} onPress={() => changeDelay(delayMs + 100)} />
          <DelayButton label="+0.5s" disabled={!request.delayEnabled} onPress={() => changeDelay(delayMs + 500)} />
        </View>
          <Text style={styles.hint}>
            {request.delayEnabled ? t('player.delayHint') : t('player.delayHintOff')}
          </Text>
        </View>
    </>
  );
}

function VlcAudio({ request, close }: { request: Of<'vlcAudio'>; close: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.title}>{t('player.audio')}</Text>
        {request.tracks.length === 0 ? (
          <Text style={styles.empty}>{t('player.noAudio')}</Text>
        ) : (
          request.tracks.map(track => (
            <TrackRow
              key={`aud-${track.id}`}
              label={track.label}
              selected={request.activeId === track.id}
              onPress={() => { request.onPick(track.id); close(); }}
            />
          ))
        )}
        {request.declaredCount > request.tracks.length && request.tracks.length > 0 ? (
          <Text style={styles.hint}>{t('player.transcodedAudio', { tracks: request.declaredCount })}</Text>
        ) : null}
    </>
  );
}

function NativeTracks({ request, close }: { request: Of<'tracks'>; close: () => void }) {
  const { t } = useTranslation();
  const { player } = request;

  // Read off the player once, when the sheet opens: AVPlayer publishes its
  // track lists as properties, not as events.
  const [subtitles] = useState<any[]>(() => player?.availableSubtitleTracks ?? []);
  const [audios] = useState<any[]>(() => player?.availableAudioTracks ?? []);
  const [activeSub, setActiveSub] = useState<any>(() => player?.subtitleTrack ?? null);
  const [activeAudio, setActiveAudio] = useState<any>(() => player?.audioTrack ?? null);

  function pickEmbedded(track: any | null) {
    try {
      player.subtitleTrack = track;
      setActiveSub(track);
      if (track) request.onPickExternal(null); // an embedded track replaces the overlay
    } catch {}
  }

  function pickAudio(track: any) {
    try {
      player.audioTrack = track;
      setActiveAudio(track);
    } catch {}
  }

  const hasAnySub = subtitles.length > 0 || request.externalSubs.length > 0;

  return (
    <>
      <Text style={styles.title}>{t('player.subtitles')}</Text>
      {!hasAnySub ? (
        <Text style={styles.empty}>{t('player.noSubtitles')}</Text>
      ) : (
        <>
          <TrackRow
            label={t('player.off')}
            selected={!activeSub && request.activeExternalSubIndex == null}
            onPress={() => { pickEmbedded(null); request.onPickExternal(null); close(); }}
          />
          {subtitles.map((track, i) => (
            <TrackRow
              key={`emb-${i}`}
              label={t('player.trackEmbedded', {
                label: track.label ?? track.language ?? t('player.trackNumber', { number: i + 1 }),
              })}
              selected={activeSub && (activeSub.id === track.id || activeSub.label === track.label)}
              onPress={() => { pickEmbedded(track); close(); }}
            />
          ))}
          {request.externalSubs.map(s => (
            <TrackRow
              key={`ext-${s.index}`}
              label={t('player.trackExternal', { label: s.label })}
              selected={request.activeExternalSubIndex === s.index}
              onPress={() => { pickEmbedded(null); request.onPickExternal(s.index); close(); }}
            />
          ))}
        </>
      )}

      <Text style={[styles.title, styles.secondTitle]}>{t('player.audio')}</Text>
      {/*
        * On a transcode the file has one audio track and AVPlayer has nothing
        * to switch between, so the server's list is the real one: choosing
        * from it asks for a new stream, resumed where this one is.
        */}
      {request.serverAudio ? (
        request.serverAudio.tracks.length === 0 ? (
          <Text style={styles.empty}>{t('player.noAlternateAudio')}</Text>
        ) : (
          request.serverAudio.tracks.map(track => (
            <TrackRow
              key={`srv-${track.index}`}
              label={track.label}
              selected={request.serverAudio?.activeIndex === track.index}
              onPress={() => { request.serverAudio?.onPick(track.index); close(); }}
            />
          ))
        )
      ) : audios.length === 0 ? (
        <Text style={styles.empty}>{t('player.noAlternateAudio')}</Text>
      ) : (
        audios.map((track, i) => (
          <TrackRow
            key={`aud-${i}`}
            // AVPlayer reports what the file says, and this file says nothing.
            // The title's own language is a better answer than "Track 1".
            label={withLanguage(
              track.label ?? t('player.trackNumber', { number: i + 1 }),
              (() => {
                const lang = resolvedTrackLanguage(track.language, request.originalLanguage, audios.length);
                return lang ? t(`trackLanguages.${lang}`, { defaultValue: '' }) : null;
              })(),
            )}
            selected={activeAudio && (activeAudio.id === track.id || activeAudio.label === track.label)}
            onPress={() => { pickAudio(track); close(); }}
          />
        ))
      )}
    </>
  );
}

function Speed({ request, close }: { request: Of<'speed'>; close: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.title}>{t('player.speed')}</Text>
      {request.rates.map(rate => (
        <TrackRow
          key={rate}
          label={`${rate}x${rate === 1 ? ` (${t('player.speedNormal')})` : ''}`}
          selected={Math.abs(request.current - rate) < 0.01}
          onPress={() => { request.onPick(rate); close(); }}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // No corners and no handle: the sheet around this draws both.
  // No flex, for the same reason as the seasons sheet: the card is measured
  // from this view, and flex would make it report the whole screen.
  root: { backgroundColor: colors.bgElevated },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.md },
  secondTitle: { marginTop: spacing.lg },
  empty: { ...type.small, color: colors.textDim, paddingVertical: spacing.md, textAlign: 'center' },
  delayBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  delayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  delayLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase' },
  delayValue: { ...type.small, color: colors.text, fontWeight: '600' },
  delayRow: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...type.small, color: colors.textDim, lineHeight: 18 },
});
