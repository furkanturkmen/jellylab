import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing } from '@/theme';

const FADE_END = 130;

export function useTabHeaderMetrics() {
  const insets = useSafeAreaInsets();
  return { headerHeight: insets.top + 52, topInset: insets.top };
}

export function TabHeader({ title, scrollY }: { title: string; scrollY: Animated.Value }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

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

  const auth = state.status === 'signed-in' ? state.auth : null;

  return (
    <Animated.View
      style={[
        styles.bar,
        { paddingTop: insets.top, height: insets.top + 52, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Text style={styles.title}>{title}</Text>
      {auth ? (
        <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.8} style={styles.avatarBtn}>
          {auth.primaryImageTag ? (
            <Image
              key={auth.primaryImageTag}
              source={{ uri: Jellyfin.userImageUrl(auth.userId, auth.primaryImageTag, 96) }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitials}>{auth.userName?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : null}
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
    justifyContent: 'space-between',
    zIndex: 10,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassTint },
  avatarInitials: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
