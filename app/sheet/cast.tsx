import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import GoogleCast, { useCastState } from 'react-native-google-cast';

import { colors, radius, spacing, type } from '@/theme';

/**
 * Pick a Chromecast.
 *
 * Was a Modal with a backdrop, a drawn handle and a Close button underneath.
 * As a `formSheet` route iOS supplies all three, and `fitToContents` means the
 * card is as tall as the list of devices - which grows as discovery finds
 * them, and the sheet grows with it.
 */
export default function CastSheet() {
  const router = useRouter();
  const { t } = useTranslation();
  const castState = useCastState();
  const [devices, setDevices] = useState<any[]>([]);
  const [scanning, setScanning] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    const discovery = GoogleCast.getDiscoveryManager();
    let sub: any;

    (async () => {
      try {
        await discovery.startDiscovery();
        const current = await discovery.getDevices();
        setDevices(current ?? []);
      } catch {}
    })();

    try {
      sub = discovery.onDevicesUpdated(next => setDevices(next ?? []));
    } catch {}

    // Discovery never says it is finished, so the spinner is on a timer. Six
    // seconds is long enough for a device on the same network to answer.
    const handle = setTimeout(() => setScanning(false), 6000);

    return () => {
      clearTimeout(handle);
      try { sub?.remove?.(); } catch {}
    };
  }, []);

  async function connect(device: any) {
    setConnecting(device.deviceId);
    try {
      await GoogleCast.getSessionManager().startSession(device.deviceId);
      router.back();
    } catch {
      // Nothing useful to say: the device list stays up so it can be retried.
    } finally {
      setConnecting(null);
    }
  }

  async function disconnect() {
    try {
      await GoogleCast.getSessionManager().endCurrentSession(true);
    } catch {}
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('player.castTo')}</Text>
        {scanning ? <ActivityIndicator color={colors.text} /> : null}
      </View>

      {castState === 'connected' ? (
        <TouchableOpacity style={styles.disconnect} onPress={disconnect} activeOpacity={0.8}>
          <Text style={styles.disconnectText}>{t('player.disconnect')}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.list}>
        {devices.length === 0 && !scanning ? (
          <Text style={styles.empty}>{t('player.noDevices')}</Text>
        ) : null}
        {devices.map(d => (
          <TouchableOpacity
            key={d.deviceId ?? d.uniqueId}
            style={styles.deviceRow}
            onPress={() => connect(d)}
            disabled={!!connecting}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <SymbolView
              name={{ ios: 'tv.badge.wifi', android: 'cast', web: 'cast' }}
              tintColor={colors.text}
              size={22}
            />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.deviceName}>{d.friendlyName ?? d.name ?? t('player.unknownDevice')}</Text>
              {d.modelName ? <Text style={styles.deviceModel}>{d.modelName}</Text> : null}
            </View>
            {connecting === d.deviceId ? <ActivityIndicator color={colors.text} /> : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bgElevated, padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  list: { marginTop: spacing.md },
  empty: { ...type.small, color: colors.textDim, paddingVertical: spacing.md, textAlign: 'center' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deviceName: { ...type.body, color: colors.text },
  deviceModel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  disconnect: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 69, 58, 0.5)',
  },
  disconnectText: { color: 'rgba(255, 99, 99, 1)', ...type.small, fontWeight: '600' },
});
