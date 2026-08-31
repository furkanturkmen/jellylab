import { StyleSheet } from 'react-native';

import { colors, spacing, type } from '@/theme';

/**
 * The chrome both player engines draw: the overlay, its buttons, the subtitle
 * line. They render the same controls over different video views, so the
 * styles are shared rather than duplicated - the two drifted apart more than
 * once while they lived in one file together.
 */
export const styles = StyleSheet.create({
  playerContainer: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  overlayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  overlayTitle: { ...type.bodyStrong, color: colors.text, flex: 1 },
  overlayCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  playPauseBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  skipBtn: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  overlayBottomWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timeText: { ...type.small, color: colors.text, fontVariant: ['tabular-nums'] as any },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  overlayIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  subOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  subText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  vlcLoading: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
