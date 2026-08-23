import { useEffect, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { colors, radius, spacing } from '@/theme';
import { useSearchQuery } from '@/store/search';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function useScaleOnPress() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => { scale.value = withSpring(0.97, { damping: 18, stiffness: 400, mass: 0.5 }); },
    onPressOut: () => { scale.value = withSpring(1, { damping: 15, stiffness: 350, mass: 0.5 }); },
  };
}

function TabItemButton({
  onPress,
  focused,
  ios,
  iosFill,
  android,
  label,
}: {
  onPress: () => void;
  focused: boolean;
  ios: string;
  iosFill: string;
  android: string;
  label: string;
}) {
  const press = useScaleOnPress();
  const tint = focused ? colors.text : colors.textMuted;
  const iosName = focused ? iosFill : ios;
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.pillItem, focused && styles.pillItemActive, press.style]}
    >
      <SymbolView name={{ ios: iosName as any, android: android as any, web: android as any }} tintColor={tint} size={22} />
      <Text style={[styles.pillLabel, { color: tint }]} numberOfLines={1}>{label}</Text>
    </AnimatedPressable>
  );
}

function GlassCircle({ onPress, icon, size = 22 }: { onPress: () => void; icon: { ios: string; android: string }; size?: number }) {
  const press = useScaleOnPress();
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.searchCircle, press.style]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView tint="systemUltraThinMaterialDark" intensity={100} style={[StyleSheet.absoluteFill, styles.blur]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.blurFallback]} />
      )}
      <SymbolView name={{ ios: icon.ios as any, android: icon.android as any, web: icon.android as any }} tintColor={colors.text} size={size} />
    </AnimatedPressable>
  );
}

const ICON_MAP: Record<string, { ios: string; iosFill: string; android: string; label: (t: any) => string }> = {
  index: {
    ios: 'rectangle.stack',
    iosFill: 'rectangle.stack.fill',
    android: 'video_library',
    label: t => t('tabs.library'),
  },
  requests: {
    ios: 'paperplane',
    iosFill: 'paperplane.fill',
    android: 'inbox',
    label: t => t('tabs.requests'),
  },
  downloads: {
    ios: 'arrow.down.circle',
    iosFill: 'arrow.down.circle.fill',
    android: 'download',
    label: t => t('tabs.downloads'),
  },
  search: {
    ios: 'magnifyingglass',
    iosFill: 'magnifyingglass.circle.fill',
    android: 'search',
    label: t => t('tabs.search'),
  },
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useSearchQuery();
  const [searchFocused, setSearchFocused] = useState(false);
  // Native keyboard frame, so the bar rides the keyboard instead of snapping
  // to its final height on the show/hide event.
  const keyboard = useAnimatedKeyboard();

  const mainRoutes = state.routes.filter(r => r.name !== 'search');
  const searchRoute = state.routes.find(r => r.name === 'search');
  const currentRouteName = state.routes[state.index]?.name;
  const isSearchActive = currentRouteName === 'search';

  // Leaving the search tab drops focus, so the home button comes back.
  useEffect(() => {
    if (!isSearchActive && searchFocused) setSearchFocused(false);
  }, [isSearchActive, searchFocused]);

  const restingBottom = insets.bottom > 0 ? insets.bottom + 8 : spacing.lg;
  const containerStyle = useAnimatedStyle(() => ({
    bottom: keyboard.height.value > 0 ? keyboard.height.value + spacing.sm : restingBottom,
  }));

  function nav(name: string) {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name as never);
  }

  function openSearch() {
    nav('search');
  }

  const transition = LinearTransition.duration(260);

  // Typing collapses the left slot to nothing so the field owns the full width.
  const hideLeft = isSearchActive && searchFocused;

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="box-none">
      {/* Left slot: pill (with tabs) OR home circle OR gone — same Animated node so width interpolates */}
      <Animated.View
        layout={transition}
        pointerEvents={hideLeft ? 'none' : 'auto'}
        style={[
          styles.leftSlot,
          hideLeft ? styles.leftHidden : isSearchActive ? styles.leftCollapsed : styles.leftExpanded,
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView tint="systemUltraThinMaterialDark" intensity={100} style={[StyleSheet.absoluteFill, styles.blur]} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.blurFallback]} />
        )}
        {isSearchActive ? (
          <Animated.View entering={FadeIn.duration(120)} style={styles.slotCenter}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setQuery('');
                nav('index');
              }}
              style={styles.slotFullTap}
              hitSlop={4}
            >
              <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={colors.text} size={22} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(120)} style={styles.pillRow}>
            {mainRoutes.map(route => {
              const meta = ICON_MAP[route.name];
              if (!meta) return null;
              return (
                <TabItemButton
                  key={route.key}
                  onPress={() => nav(route.name)}
                  focused={route.name === currentRouteName}
                  ios={meta.ios}
                  iosFill={meta.iosFill}
                  android={meta.android}
                  label={meta.label(t)}
                />
              );
            })}
          </Animated.View>
        )}
      </Animated.View>

      {/* Right slot: search bar (expanded) OR search circle — same Animated node */}
      {searchRoute ? (
        <Animated.View
          layout={transition}
          style={[styles.rightSlot, isSearchActive ? styles.rightExpanded : styles.rightCollapsed]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView tint="systemUltraThinMaterialDark" intensity={100} style={[StyleSheet.absoluteFill, styles.blur]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.blurFallback]} />
          )}
          {isSearchActive ? (
            <Animated.View entering={FadeIn.duration(160)} style={styles.searchRow}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={colors.textMuted} size={20} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('search.placeholder')}
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(120)} style={styles.slotCenter}>
              <Pressable onPress={openSearch} style={styles.slotFullTap} hitSlop={4}>
                <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={colors.text} size={24} />
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>
      ) : null}

      {/* Detached X circle — only when search is active */}
      {isSearchActive ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          <GlassCircle
            onPress={() => {
              setQuery('');
              Keyboard.dismiss();
            }}
            icon={{ ios: 'xmark', android: 'close' }}
            size={20}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade' as any }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="downloads" />
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
    borderColor: colors.glassEdge,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    flexShrink: 1,
  },
  blur: { backgroundColor: colors.glassLift },
  blurFallback: { backgroundColor: colors.bgElevated },
  pillItem: {
    height: PILL_HEIGHT - 12,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
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
    borderColor: colors.glassEdge,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  searchBar: {
    flex: 1,
    height: PILL_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },

  // Slot system for smooth width transitions
  leftSlot: {
    height: PILL_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  leftExpanded: {
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
  },
  leftCollapsed: {
    width: CIRCLE,
    alignSelf: 'flex-start',
  },
  leftHidden: {
    width: 0,
    opacity: 0,
    borderWidth: 0,
    alignSelf: 'flex-start',
    // cancels the container's gap so the field reclaims the full width
    marginRight: -spacing.md,
  },
  rightSlot: {
    height: PILL_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  rightCollapsed: {
    width: CIRCLE,
  },
  rightExpanded: {
    flex: 1,
  },
  slotCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slotFullTap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', height: '100%' },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
});
