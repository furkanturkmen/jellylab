import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { cleanSubLabel, DelayButton, SubGroupLabel, TrackRow } from '@/components/TrackRow';
import { clearPlayerSheet, pendingPlayerSheet, type PlayerSheetRequest } from '@/store/playerSheet';
import { resolvedTrackLanguage, withLanguage } from '@/lib/tracks';
import { HAS_LIQUID_GLASS } from '@/lib/device';
import { colors, radius, spacing, type } from '@/theme';

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
   *
   * Horizontal padding comes from the safe-area insets rather than one fixed
   * value. This sheet is landscape over the player, and landscape is where the
   * Dynamic Island sits on a long edge: at a flat 16pt the title ran under it.
   */
  const pad = [
    styles.content,
    {
      paddingBottom: Math.max(insets.bottom, spacing.lg),
      paddingLeft: Math.max(insets.left, spacing.lg),
      paddingRight: Math.max(insets.right, spacing.lg),
    },
  ];

  const body = (
    <>
      {request.kind === 'vlcTracks' ? <VlcTracks request={request} close={router.back} /> : null}
      {request.kind === 'tracks' ? <NativeTracks request={request} close={router.back} /> : null}
      {request.kind === 'speed' ? <Speed request={request} close={router.back} /> : null}
    </>
  );

  /*
   * A centred column rather than the whole width of the sheet.
   *
   * Landscape over a film is close to a thousand points across, and a list of
   * one-line track names stretched over all of it leaves the checkmark an inch
   * from the label it belongs to. Centring also holds the content clear of
   * both long edges, which is the other half of the Dynamic Island problem.
   */
  return (
    <ScrollView
      style={HAS_LIQUID_GLASS ? styles.rootGlass : styles.root}
      contentContainerStyle={pad}
      showsVerticalScrollIndicator={false}
    >
      {HAS_LIQUID_GLASS ? (
        <GlassView style={styles.card} glassEffectStyle="regular" colorScheme="dark">
          <CloseButton onPress={router.back} />
          {body}
        </GlassView>
      ) : (
        <View style={[styles.card, styles.cardSolid]}>
          <CloseButton onPress={router.back} />
          {body}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * An explicit way out.
 *
 * Dismissing was left to UIKit's grabber and drag-to-dismiss, which is what a
 * formSheet gives you in portrait. In landscape over the player there is no
 * grabber to be seen and the drag has nowhere to go, so the picker was a room
 * with no door: the only way out was picking a track you did not want.
 */
function CloseButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={styles.close}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      // The glyph is small. What you have to hit should not be.
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <SymbolView
        name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
        tintColor={colors.textMuted}
        size={26}
      />
    </TouchableOpacity>
  );
}

type Of<K extends PlayerSheetRequest['kind']> = Extract<PlayerSheetRequest, { kind: K }>;

/**
 * Two columns: what you hear on the left, what you read on the right.
 *
 * Both were their own sheet behind their own button. Choosing a dub and then
 * its subtitles meant open, pick, watch the card slide away over the film,
 * open the other. Side by side, both lists and both ticks are in front of you,
 * which is usually the actual question.
 */
function VlcTracks({ request, close }: { request: Of<'vlcTracks'>; close: () => void }) {
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
      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={styles.title}>{t('player.audio')}</Text>
          {request.audioTracks.length === 0 ? (
            <Text style={styles.empty}>{t('player.noAudio')}</Text>
          ) : (
            request.audioTracks.map(track => (
              <TrackRow
                key={`aud-${track.id}`}
                label={track.label}
                selected={request.activeAudioId === track.id}
                onPress={() => { request.onPickAudio(track.id); close(); }}
              />
            ))
          )}
          {request.declaredAudioCount > request.audioTracks.length && request.audioTracks.length > 0 ? (
            <Text style={styles.hint}>{t('player.transcodedAudio', { tracks: request.declaredAudioCount })}</Text>
          ) : null}
        </View>

        <View style={styles.column}>
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
              {request.externalSubs.map(sub => (
                <TrackRow
                  key={`ext-${sub.index}`}
                  label={cleanSubLabel(sub.label)}
                  selected={request.activeExternalIndex === sub.index}
                  onPress={() => { request.onPickExternal(sub.index); close(); }}
                />
              ))}
            </>
          )}
        </View>
      </View>

      {/* Timing belongs to the subtitles but spans both columns: it is a wide
        * row of small buttons, and squeezed into half the width they stop
        * being hittable. */}
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
    <View style={styles.columns}>
      <View style={styles.column}>
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
      </View>

      <View style={styles.column}>
      <Text style={styles.title}>{t('player.audio')}</Text>
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
            /*
             * With one track, that track is what you are hearing - AVPlayer
             * simply has not reported a selection yet, and a list with nothing
             * ticked reads as broken.
             */
            selected={
              audios.length === 1 ||
              (activeAudio && (activeAudio.id === track.id || activeAudio.label === track.label))
            }
            onPress={() => { pickAudio(track); close(); }}
          />
        ))
      )}
      </View>
    </View>
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
  // With glass the card carries the surface, so the sheet behind it has to let
  // the film through. Paired with the transparent contentStyle on the route.
  rootGlass: { backgroundColor: 'transparent' },
  content: { paddingTop: spacing.xl },
  card: {
    width: '100%',
    // Two columns of track names, and no wider. A phone on its side is close
    // to 900pt, so this fills it without letting the lists drift apart.
    maxWidth: 860,
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    overflow: 'hidden',
  },
  // Only when there is no glass to carry it.
  cardSolid: { backgroundColor: colors.glassTint },
  close: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1 },
  columns: { flexDirection: 'row', gap: spacing.xl },
  // Equal halves, and each may shrink: without minWidth 0 a long track name
  // pushes its column wider and the other one collapses.
  column: { flex: 1, minWidth: 0 },
  // Room for the close button, so a long title does not run under it.
  title: { ...type.h1, color: colors.text, marginBottom: spacing.md, paddingRight: spacing.xl },
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
