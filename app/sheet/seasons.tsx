import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import * as Jellyseerr from '@/api/jellyseerr';
import { clearSeasonSheet, pendingSeasonSheet } from '@/store/sheet';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Which seasons to request.
 *
 * This was a full-screen Modal with a header of its own: a Cancel word on the
 * left, a title, and a Request word on the right, all drawn by us. As a route
 * with `presentation: 'formSheet'` (see the root layout) iOS draws the card,
 * the grabber, the dimming and the drag-to-dismiss, and the list keeps its own
 * scroll inside a sheet that can be pulled to full height.
 *
 * The seasons and the callback come through `store/sheet`, because a route is
 * addressed by URL and neither of those survives being turned into a string.
 */
export default function SeasonSheet() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Read once: the sheet owns the selection from here on, and a later write to
  // the store is a different opening of it.
  const request = useMemo(() => pendingSeasonSheet(), []);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(request?.initial ?? []));

  useEffect(() => {
    // Nothing to show means the screen that pushed this is gone - a reload
    // during development, or a deep link straight to the sheet.
    if (!request) router.back();
    return () => clearSeasonSheet();
  }, [request, router]);

  if (!request) return null;

  function seasonStatusText(season: Jellyseerr.SeerrSeason): string {
    const status = Jellyseerr.seasonStatus(season);
    return t(status.key, { count: status.count ?? 0 });
  }

  function toggle(seasonNumber: number) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });
  }

  function confirm() {
    const chosen = [...picked].sort((a, b) => a - b);
    // Close first: the request takes a round trip, and the sheet sliding away
    // on tap is what says the tap landed.
    router.back();
    request?.onConfirm(chosen);
  }

  return (
    // The card ends at the home indicator, not a guessed distance from it.
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      {/*
        * Everything lives in this one scroller, the Request button included.
        *
        * A form sheet lays out at most two subviews, and drawing a title, a
        * list and a footer as siblings had UIKit placing them over each other -
        * the title landing on top of the first row, inset differently from it.
        */}
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('request.seasons')}</Text>
        {request.seasons.map(s => {
          const selectable = Jellyseerr.isSeasonRequestable(s);
          const on = picked.has(s.seasonNumber);
          return (
            <TouchableOpacity
              key={s.seasonNumber}
              style={[styles.seasonRow, !selectable && styles.seasonRowOff]}
              onPress={() => selectable && toggle(s.seasonNumber)}
              activeOpacity={selectable ? 0.7 : 1}
              disabled={!selectable}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !selectable }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.seasonName}>
                  {s.name || t('request.seasonNumber', { number: s.seasonNumber })}
                </Text>
                <Text style={styles.seasonMeta}>{seasonStatusText(s)}</Text>
              </View>
              {selectable ? (
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <Text style={styles.note}>{t('request.seasonsNote')}</Text>

        <TouchableOpacity
          style={[styles.confirm, picked.size === 0 && styles.confirmOff]}
          onPress={confirm}
          disabled={picked.size === 0}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmText}>
            {picked.size > 0 ? `${t('action.request')} (${picked.size})` : t('action.request')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // No rounded corners or handle here: both belong to the sheet iOS draws
  // around this content.
  // No flex: the sheet is sized to this view, so it has to be as tall as
  // what is in it rather than as tall as it is allowed to be.
  // paddingTop clears the grabber iOS draws over the top of the card.
  root: { backgroundColor: colors.bgElevated, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.md },
  list: { paddingBottom: 0 },
  seasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  seasonRowOff: { opacity: 0.4 },
  seasonName: { ...type.body, color: colors.text },
  seasonMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  check: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.text, borderColor: colors.text },
  checkMark: { color: colors.bg, fontSize: 14, fontWeight: '700' },
  note: { ...type.small, color: colors.textDim, marginTop: spacing.md, lineHeight: 18 },
  confirm: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  confirmOff: { opacity: 0.4 },
  confirmText: { color: colors.accentContrast, ...type.body, fontWeight: '600' },
});
