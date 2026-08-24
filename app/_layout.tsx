import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '@/i18n';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentServer } from '@/hooks/useServer';
import { clearJellyfinAuth, clearJellyseerrAuth } from '@/store/auth';
import { installErrorLogging } from '@/lib/errorLog';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// First thing, before anything else here can throw: an error during this
// module's own evaluation is the one that leaves the root layout undefined and
// surfaces nowhere near its cause.
installErrorLogging();

SplashScreen.preventAutoHideAsync();

// Without this a notification arriving while the app is open is swallowed
// silently, which reads as "notifications are broken".
//
// Required lazily, not imported at the top of the file. On a binary without
// the native module the import itself throws, and a throw while this module is
// evaluating leaves the root layout undefined — which surfaces as expo-router
// failing to destructure a route, nowhere near the real cause.
try {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {}

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
  const { server, ready: serverReady } = useCurrentServer();
  const segments = useSegments();
  const router = useRouter();

  // Migration: existing auth from the old hardcoded-URL build with no current server
  // would fire API calls at an empty baseURL. Clear it so login flow restarts cleanly.
  useEffect(() => {
    if (!serverReady) return;
    if (!server && state.status === 'signed-in') {
      clearJellyfinAuth();
      clearJellyseerrAuth();
    }
  }, [serverReady, server, state.status]);

  useEffect(() => {
    if (!serverReady) return;
    if (state.status === 'loading') return;

    const first = segments[0] as string | undefined;
    const inServers = first === 'servers' || first === 'server-edit';
    const inLogin = first === 'login';

    const dismissModals = () => {
      try { if ((router as any).canDismiss?.()) (router as any).dismissAll?.(); } catch {}
    };

    if (!server) {
      if (!inServers) {
        dismissModals();
        router.replace('/servers');
      }
      return;
    }
    if (state.status === 'signed-out' && !inLogin && !inServers) {
      dismissModals();
      router.replace('/login');
    } else if (state.status === 'signed-in' && inLogin) {
      dismissModals();
      router.replace('/(tabs)');
    }
  }, [state.status, segments, server, serverReady]);

  if (!serverReady) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: '' }} />
        {/* Draws its own header, the same one the tabs use. */}
        <Stack.Screen name="library/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="tmdb/[type]/[id]" options={{ title: '' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile', presentation: 'modal' }} />
        <Stack.Screen name="servers" options={{ title: 'Servers', presentation: 'modal' }} />
        <Stack.Screen name="server-edit" options={{ title: 'Server', presentation: 'modal' }} />
        <Stack.Screen name="settings/subtitles" options={{ title: 'Subtitles' }} />
        <Stack.Screen name="settings/playback" options={{ title: 'Playback' }} />
        <Stack.Screen name="settings/content" options={{ title: 'Content' }} />
        <Stack.Screen name="settings/language" options={{ title: 'Language' }} />
        <Stack.Screen name="settings/password" options={{ title: 'Password' }} />
      </Stack>
    </ThemeProvider>
  );
}
