import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '@/theme';

/**
 * The tab header's twin, for screens that were pushed rather than switched to.
 *
 * Same bar height, same 34pt title, same fade on scroll - the only difference
 * is what sits opposite the title: a back control instead of the avatar. The
 * native stack header was the alternative, and it looks like a different app:
 * a small centred title, a system tint, and a back label that reads whatever
 * the previous route was called.
 */

const FADE_END = 130;

export function ScreenHeader({ title, scrollY }: { title: string; scrollY: Animated.Value }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const opacity = scrollY.interpolate({
    inputRange: [0, 60, FADE_END],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  const translateY = scrollY.interpolate({
    inputRange: [0, FADE_END],
    outputRange: [0, -24],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        { paddingTop: insets.top, height: insets.top + 52, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.8}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        // The circle is small for a finger; the tap area is not.
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          tintColor={colors.text}
          size={17}
        />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {/* Balances the back button so the title sits where a tab title sits. */}
      <View style={styles.spacer} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  spacer: { width: 0 },
});
