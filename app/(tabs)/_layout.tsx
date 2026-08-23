import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          position: 'absolute',
        },
        tabBarBackground: Platform.OS === 'ios'
          ? () => <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
          : undefined,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.library'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'play.rectangle.on.rectangle', android: 'video_library', web: 'video_library' }} tintColor={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t('tabs.requests'),
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'tray.and.arrow.down', android: 'inbox', web: 'inbox' }} tintColor={color} size={26} />
          ),
        }}
      />
    </Tabs>
  );
}
