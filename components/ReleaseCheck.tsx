import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import * as Push from '@/api/push';
import { loadPrefs, savePrefs, withRejectionReason } from '@/store/prefs';
import { suspicious, verdict, type Verdict } from '@/lib/candidates';
import { formatBytes } from '@/lib/bytes';
import { colors, radius, spacing, type as t } from '@/theme';

/**
 * Why a request is going nowhere.
 *
 * A request that sits still reads as "searching" whether the wrong release
 * keeps being chosen or no permitted release exists at all - and those need
 * opposite fixes. Fall (2022) found 256 releases and accepted 34, then grabbed
 * a PROPER that was malware, twice. Bin Roye (2015) found seven and accepted
 * none, because every one was a DVDRip and the profile starts at 720p; it
 * would have searched forever.
 *
 * Opened by hand from one card, never on a poll: the server runs a live search
 * across every indexer and takes tens of seconds.
 *
 * Only acceptable releases are listed. Showing the refused ones would be a
 * list of things that cannot happen - but when *nothing* is acceptable, that
 * empty list plus the reason is the entire answer, so the reason is shown
 * instead of a blank.
 */
export function ReleaseCheck({
  visible,
  onClose,
  url,
  tmdbId,
  mediaType,
  season,
  title,
  requestId,
  isRejected,
  onRejected,
  onUnrejected,
}: {
  visible: boolean;
  onClose: () => void;
  url: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  title: string;
  /** the Jellyseerr request, so a dead end can be closed from here */
  requestId?: number;
  /** already rejected - offer to undo instead of to reject */
  isRejected?: boolean;
  onRejected?: (reason: string) => void;
  onUnrejected?: () => void;
}) {
  const { t: tr } = useTranslation();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; v: Verdict; raw: Push.Candidates }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!visible) return;
    // Abandoned if the sheet is closed mid-search. The request keeps running
    // on the server either way, but nothing here should still be waiting on it.
    //
    // No reset to loading first: the caller mounts this fresh per request and
    // keys it, so the initial state is already loading and setting it here
    // would only be a second render on the way to the same place.
    const ac = new AbortController();
    Push.candidates(url, tmdbId, mediaType, season, ac.signal)
      .then(raw => setState({ kind: 'done', v: verdict(raw), raw }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => ac.abort();
  }, [visible, url, tmdbId, mediaType, season]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>{tr('common.close', { defaultValue: 'Close' })}</Text>
            </TouchableOpacity>
          </View>

          {state.kind === 'loading' ? (
            <View style={styles.centre}>
              <ActivityIndicator color={colors.textMuted} />
              {/* Named rather than a bare spinner: this legitimately takes
                  tens of seconds, and a spinner with no explanation reads as
                  broken long before it finishes. */}
              <Text style={styles.note}>{tr('requests.check.searching')}</Text>
            </View>
          ) : state.kind === 'error' ? (
            <View style={styles.centre}>
              <Text style={styles.note}>{tr('requests.check.failed')}</Text>
              <Text style={styles.dim}>{state.message}</Text>
            </View>
          ) : (
            <Summary
              v={state.v}
              raw={state.raw}
              url={url}
              tmdbId={tmdbId}
              mediaType={mediaType}
              season={season}
              requestId={requestId}
              isRejected={isRejected}
              onRejected={onRejected}
              onUnrejected={onUnrejected}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function Summary({ v, raw, url, tmdbId, mediaType, season, requestId, isRejected, onRejected, onUnrejected }: {
  v: Verdict;
  raw: Push.Candidates;
  url: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  requestId?: number;
  isRejected?: boolean;
  onRejected?: (reason: string) => void;
  onUnrejected?: () => void;
}) {
  const { t: tr } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  /*
   * Undoing a rejection is an administrator's action, so the button only
   * exists for one. Jellyseerr enforces this itself - the check here is so
   * nobody is shown a control that would fail, not as the boundary.
   */
  const [mayManage, setMayManage] = useState(false);
  useEffect(() => {
    let alive = true;
    Jellyseerr.currentUser()
      .then(u => { if (alive) setMayManage(Jellyseerr.canManageRequests(u)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /*
   * Close a request nothing can satisfy.
   *
   * Bin Roye had seven releases and a dead swarm behind every one of them. It
   * sat reporting "searching" for a day, indistinguishable from something
   * about to arrive. Declining keeps the record and stops the searching, and
   * Jellyseerr can undo it.
   *
   * The reason is stored on the device because Jellyseerr has no field for
   * one - so a rejected row can say why rather than just going quiet.
   */
  async function unreject() {
    if (requestId == null) return;
    setRejecting(true);
    setRejectError(null);
    try {
      await Jellyseerr.approveRequest(requestId);
      // Put it back in front of the *arrs, or approving would restore the
      // record and leave nothing looking for it.
      await Push.setMonitored(url, tmdbId, mediaType, true, season).catch(() => {});
      // The stored reason goes with it, or the card would keep explaining a
      // rejection that no longer exists.
      const prefs = await loadPrefs();
      await savePrefs({
        ...prefs,
        rejectionReasons: withRejectionReason(prefs, tmdbId, null),
      });
      onUnrejected?.();
    } catch (e: unknown) {
      setRejectError(e instanceof Error ? e.message : String(e));
      setRejecting(false);
    }
  }

  async function reject(reason: string) {
    if (requestId == null) return;
    setRejecting(true);
    setRejectError(null);
    try {
      await Jellyseerr.declineRequest(requestId);
      /*
       * And actually stop the searching.
       *
       * Declining closes the record in Jellyseerr and nothing more - Sonarr
       * and Radarr carry on regardless. Without this the pill went red while
       * eight indexers were queried every thirty minutes for something that
       * does not exist.
       *
       * Failing here must not undo the decline: the request is closed either
       * way, and a title still being searched for is a smaller problem than a
       * button that half worked and reported an error.
       */
      await Push.setMonitored(url, tmdbId, mediaType, false, season)
        .catch(() => {});
      const prefs = await loadPrefs();
      await savePrefs({
        ...prefs,
        rejectionReasons: withRejectionReason(prefs, tmdbId, reason),
      });
      onRejected?.(reason);
    } catch (e: unknown) {
      setRejectError(e instanceof Error ? e.message : String(e));
      setRejecting(false);
    }
  }

  /*
   * Reject, or undo it - wherever the verdict makes stopping the honest step.
   *
   * Offered on `nothing` as well as `deadEnd`. Those are the two answers that
   * will not fix themselves, and "no releases exist" is if anything the
   * clearer case of the two: a dead end has releases that a profile change
   * might admit, an absence has nothing to admit.
   */
  function actions(reason: string) {
    if (requestId == null) return null;
    return (
      <>
        {isRejected && mayManage && onUnrejected ? (
          <TouchableOpacity style={styles.unreject} disabled={rejecting} onPress={unreject}>
            <Text style={styles.unrejectText}>
              {rejecting ? tr('requests.check.unrejecting') : tr('requests.check.unreject')}
            </Text>
          </TouchableOpacity>
        ) : !isRejected && onRejected ? (
          <TouchableOpacity style={styles.reject} disabled={rejecting} onPress={() => reject(reason)}>
            <Text style={styles.rejectText}>
              {rejecting ? tr('requests.check.rejecting') : tr('requests.check.reject')}
            </Text>
          </TouchableOpacity>
        ) : null}
        {rejectError ? (
          <Text style={styles.reason}>{tr('requests.check.rejectFailed')}: {rejectError}</Text>
        ) : (
          <Text style={styles.dim}>{tr('requests.check.rejectWhy')}</Text>
        )}
      </>
    );
  }

  if (v.kind === 'untracked') {
    return (
      <View style={styles.centre}>
        <Text style={styles.headline}>{tr('requests.check.untracked')}</Text>
        <Text style={styles.dim}>{tr('requests.check.untrackedWhy')}</Text>
      </View>
    );
  }

  if (v.kind === 'nothing') {
    return (
      <View style={styles.centre}>
        <Text style={styles.headline}>{tr('requests.check.nothing')}</Text>
        <Text style={styles.dim}>{tr('requests.check.nothingWhy')}</Text>
        {actions(tr('requests.check.nothing'))}
      </View>
    );
  }

  if (v.kind === 'satisfied') {
    return (
      <View style={styles.centre}>
        <Text style={styles.headline}>{tr('requests.check.satisfied')}</Text>
        {/* Radarr's own sentence, same as the dead-end case - but this one is
            good news, so it is not painted as a fault. */}
        {v.reason ? <Text style={styles.dim}>{v.reason}</Text> : null}
      </View>
    );
  }

  if (v.kind === 'deadEnd') {
    return (
      <View style={styles.centre}>
        <Text style={styles.headline}>{tr('requests.check.deadEnd', { count: v.found })}</Text>
        {/* The reason is Radarr's own sentence. Translating it would mean
            keeping a table of every rejection string the *arr can emit in
            step with them, and getting it wrong silently. */}
        {v.reason ? <Text style={styles.reason}>{v.reason}</Text> : null}
        <Text style={styles.dim}>{tr('requests.check.deadEndWhy')}</Text>

        {/* Offered only here. A dead end is the one verdict where the honest
            next step is to stop, and it is the one place the reason to record
            is already on screen. */}
        {actions(v.reason ?? tr('requests.check.deadEnd', { count: v.found }))}
      </View>
    );
  }

  return (
    <>
      <Text style={styles.headline}>
        {tr('requests.check.summary', { accepted: v.accepted, found: v.found })}
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {raw.releases.map((r, i) => (
          <View key={`${r.title}-${i}`} style={styles.row}>
            <Text style={styles.rowTitle} numberOfLines={2}>{r.title}</Text>
            <View style={styles.tags}>
              {r.quality ? <Tag text={r.quality} /> : null}
              <Tag text={tr('requests.check.score', { score: r.score })} />
              {r.seeders != null ? (
                <Tag text={tr('requests.check.seeders', { count: r.seeders })} />
              ) : null}
              {r.size ? <Tag text={formatBytes(r.size)} /> : null}
              {r.proper ? <Tag text="PROPER" warn={suspicious(r)} /> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function Tag({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <View style={[styles.tag, warn && styles.tagWarn]}>
      <Text style={[styles.tagText, warn && styles.tagWarnText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '80%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...t.h2, color: colors.text, flex: 1 },
  close: { ...t.body, color: colors.textMuted },
  centre: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  headline: { ...t.bodyStrong, color: colors.text, textAlign: 'center' },
  note: { ...t.small, color: colors.textMuted, textAlign: 'center' },
  dim: { ...t.small, color: colors.textDim, textAlign: 'center' },
  reason: { ...t.small, color: colors.pink, textAlign: 'center' },
  reject: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.pink,
  },
  rejectText: { ...t.bodyStrong, color: colors.pink },
  // Neutral rather than green: putting a request back is ordinary, not a
  // success worth celebrating.
  unreject: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  unrejectText: { ...t.bodyStrong, color: colors.text },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  row: { gap: spacing.sm, paddingVertical: spacing.sm },
  rowTitle: { ...t.small, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tagText: { ...t.caption, color: colors.textMuted },
  // The combination that beat 1813 seeders with 24 and turned out to be an
  // .exe: a PROPER the profile scores negative. Worth seeing on the row.
  tagWarn: { backgroundColor: 'rgba(249, 38, 114, 0.18)', borderColor: colors.pink },
  tagWarnText: { color: colors.pink },
});
