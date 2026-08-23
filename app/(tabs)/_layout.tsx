import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing } from '@/theme';

type SFName = 'play.rectangle.on.rectangle' | 'magnifyingglass' | 'tray.and.arrow.down';
type MDName = 'video_library' | 'search' | 'inbox';

function TabButton({
  focused,
  label,
  ios,
  android,
}: {
  focused: boolean;
  label: string;
  ios: SFName;
  android: MDName;
}) {
  const color = focused ? colors.text : colors.textMuted;
  return (
    <View style={[styles.tabInner, focused && styles.tabInnerActive]}>
      <SymbolView name={{ ios, android, web: android }} tintColor={color} size={22} />
      <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const floatingBar = {
    position: 'absolute' as const,
    left: spacing.xl,
    right: spacing.xl,
    bottom: insets.bottom > 0 ? insets.bottom + 8 : spacing.lg,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bgElevated,
    borderTopWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    overflow: 'hidden' as const,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: floatingBar,
        tabBarBackground: Platform.OS === 'ios'
          ? () => <BlurView tint="dark" intensity={80} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,15,15,0.4)' }]} />
          : undefined,
        tabBarItemStyle: { height: 72, paddingHorizontal: 6 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabButton focused={focused} label={t('tabs.library')} ios="play.rectangle.on.rectangle" android="video_library" />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabButton focused={focused} label={t('tabs.search')} ios="magnifyingglass" android="search" />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabButton focused={focused} label={t('tabs.requests')} ios="tray.and.arrow.down" android="inbox" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabInner: {
    minWidth: 96,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  tabInnerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
