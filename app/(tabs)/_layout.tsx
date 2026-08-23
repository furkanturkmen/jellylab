import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { colors, radius, spacing } from '@/theme';

const ICON_MAP: Record<string, { ios: string; android: string; label: (t: any) => string }> = {
  index: {
    ios: 'play.rectangle.on.rectangle',
    android: 'video_library',
    label: t => t('tabs.library'),
  },
  requests: {
    ios: 'tray.and.arrow.down',
    android: 'inbox',
    label: t => t('tabs.requests'),
  },
  search: {
    ios: 'magnifyingglass',
    android: 'search',
    label: t => t('tabs.search'),
  },
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom + 8 : spacing.lg;

  const mainRoutes = state.routes.filter(r => r.name !== 'search');
  const searchRoute = state.routes.find(r => r.name === 'search');
  const currentRouteName = state.routes[state.index]?.name;

  function nav(name: string) {
    const event = navigation.emit({ type: 'tabPress', target: name, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name as never);
  }

  return (
    <View style={[styles.container, { bottom }]} pointerEvents="box-none">
      <View style={styles.mainPill}>
        {Platform.OS === 'ios' ? (
          <BlurView tint="dark" intensity={80} style={[StyleSheet.absoluteFill, styles.blur]} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.blurFallback]} />
        )}
        {mainRoutes.map(route => {
          const meta = ICON_MAP[route.name];
          if (!meta) return null;
          const focused = route.name === currentRouteName;
          const tint = focused ? colors.text : colors.textMuted;
          return (
            <Pressable
              key={route.key}
              onPress={() => nav(route.name)}
              style={({ pressed }) => [styles.pillItem, focused && styles.pillItemActive, pressed && { opacity: 0.7 }]}
            >
              <SymbolView name={{ ios: meta.ios as any, android: meta.android as any, web: meta.android as any }} tintColor={tint} size={22} />
              <Text style={[styles.pillLabel, { color: tint }]} numberOfLines={1}>
                {meta.label(t)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {searchRoute ? (() => {
        const focused = searchRoute.name === currentRouteName;
        const tint = focused ? colors.text : colors.textMuted;
        return (
          <Pressable
            onPress={() => nav('search')}
            style={({ pressed }) => [styles.searchCircle, focused && styles.searchCircleActive, pressed && { opacity: 0.7 }]}
          >
            {Platform.OS === 'ios' ? (
              <BlurView tint="dark" intensity={80} style={[StyleSheet.absoluteFill, styles.blur]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.blurFallback]} />
            )}
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={tint} size={24} />
          </Pressable>
        );
      })() : null}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="requests" />
    </Tabs>
  );
}

const PILL_HEIGHT = 60;
const CIRCLE = 60;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  mainPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    flexShrink: 1,
  },
  blur: { backgroundColor: 'rgba(15,15,15,0.4)' },
  blurFallback: { backgroundColor: colors.bgElevated },
  pillItem: {
    height: PILL_HEIGHT - 12,
    minWidth: 76,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginHorizontal: 2,
  },
  pillItemActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  searchCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  searchCircleActive: {
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});
