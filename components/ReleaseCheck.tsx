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

import * as Push from '@/api/push';
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
}: {
  visible: boolean;
  onClose: () => void;
  url: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  title: string;
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
            <Summary v={state.v} raw={state.raw} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function Summary({ v, raw }: { v: Verdict; raw: Push.Candidates }) {
  const { t: tr } = useTranslation();

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
