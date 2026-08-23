import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing } from '@/theme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const floatingBar = {
    position: 'absolute' as const,
    left: spacing.xl,
    right: spacing.xl,
    bottom: insets.bottom > 0 ? insets.bottom + 8 : spacing.lg,
    height: 72,
    paddingBottom: 0,
    paddingTop: 0,
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
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        headerTintColor: colors.text,
        tabBarStyle: floatingBar,
        tabBarBackground: Platform.OS === 'ios'
          ? () => <BlurView tint="dark" intensity={70} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,20,20,0.55)' }]} />
          : undefined,
        tabBarItemStyle: { height: 72, paddingTop: 12, paddingBottom: 12 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, marginTop: 2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.library'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'play.rectangle.on.rectangle', android: 'video_library', web: 'video_library' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('tabs.requests'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'tray.and.arrow.down', android: 'inbox', web: 'inbox' }} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
