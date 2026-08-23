import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '@/i18n';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

// Info.plist now supports landscape (needed so the player can rotate),
// but the rest of the app is portrait-only. Lock at app boot.
(async () => {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {}
})();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'loading') return;
    const inAuth = segments[0] === 'login';
    if (state.status === 'signed-out' && !inAuth) {
      router.replace('/login');
    } else if (state.status === 'signed-in' && inAuth) {
      router.replace('/(tabs)');
    }
  }, [state.status, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
        <Stack.Screen name="tmdb/[type]/[id]" options={{ title: '' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile', presentation: 'modal' }} />
        <Stack.Screen name="settings/subtitles" options={{ title: 'Subtitles' }} />
        <Stack.Screen name="settings/playback" options={{ title: 'Playback' }} />
        <Stack.Screen name="settings/content" options={{ title: 'Content' }} />
        <Stack.Screen name="settings/language" options={{ title: 'Language' }} />
        <Stack.Screen name="settings/password" options={{ title: 'Password' }} />
      </Stack>
    </ThemeProvider>
  );
}
