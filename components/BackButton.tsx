import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '@/theme';

/**
 * The one way back, everywhere the app pushes a screen.
 *
 * There were three: the player's glass circle, a 36pt copy of it on the library
 * screen, and the native stack chevron with a "Back" label on the two detail
 * screens - which also carried a system tint and moved with the platform rather
 * than with this app. The player's is the one that belongs to the design, so it
 * is the one that stayed.
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
      // 44pt is the tap target; the visible circle is the same size, so the
      // slop is for the edge of the screen rather than for the control.
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        tintColor={colors.text}
        size={22}
      />
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
