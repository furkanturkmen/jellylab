import { StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, type } from '@/theme';

/**
 * The one way back, everywhere the app pushes a screen.
 *
 * There were three: the player's glass circle, a 36pt copy of it on the library
 * screen, and the native stack chevron with a "Back" label on the two detail
 * screens - which also carried a system tint and moved with the platform rather
 * than with this app. The player's is the one that belongs to the design, so it
 * is the one that stayed.
 *
 * Carries the word as well as the chevron. A bare chevron is the smaller,
 * tidier control, but the labelled one is what the native header gave these
 * screens and what reads at a glance - especially over artwork, where a lone
 * glyph is easy to lose.
 *
 * Modals are deliberately left alone: a sheet is dismissed, not navigated back
 * from, and iOS users expect the system affordance there.
 */
export function BackButton({ onPress, style }: { onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress ?? (() => router.back())}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        tintColor={colors.text}
        size={18}
      />
      <Text style={styles.label}>{t('common.back')}</Text>
    </TouchableOpacity>
  );
}

/**
 * The same control, floating over content that has no header of its own - the
 * two detail screens, whose artwork runs to the top of the screen.
 */
export function FloatingBackButton({ onPress }: { onPress?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <BackButton
      onPress={onPress}
      style={{ position: 'absolute', top: insets.top + spacing.xs, left: spacing.lg, zIndex: 20 }}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    // A pill rather than a circle now that there is a word in it. Padding is
    // tighter on the left so the chevron sits where the eye expects the edge
    // of the control, not floating inside it.
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  label: { ...type.bodyStrong, color: colors.text },
});
