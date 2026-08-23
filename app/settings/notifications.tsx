import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { getPushToken, registerDevice, unregisterDevice, sendTest } from '@/api/push';
import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPrefs().then(setPrefs);
  }, []);

  async function patch(next: Prefs) {
    setPrefs(next);
    await savePrefs(next);
  }

  const enabled = !!prefs?.pushToken;

  async function toggle(on: boolean) {
    if (!prefs || busy) return;
    setBusy(true);
    try {
      if (!on) {
        if (prefs.pushToken) {
          await unregisterDevice(prefs.pushUrl, prefs.pushSecret, prefs.pushToken);
        }
        await patch({ ...prefs, pushToken: '' });
        return;
      }

      if (!prefs.pushUrl.trim() || !prefs.pushSecret.trim()) {
        Alert.alert('Missing details', 'Fill in the server address and secret first.');
        return;
      }

      const token = await getPushToken();
      if (!token) {
        Alert.alert(
          'Notifications unavailable',
          'Permission was denied, or this is a simulator. If you denied it before, iOS only asks once — turn notifications back on for Jellylab in the Settings app.'
        );
        return;
      }

      await registerDevice(prefs.pushUrl.trim(), prefs.pushSecret.trim(), token);
      await patch({ ...prefs, pushToken: token });
      Alert.alert('Notifications on', 'This device will now get a push when a download finishes.');
    } catch (e: any) {
      Alert.alert('Could not register', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!prefs) return;
    setBusy(true);
    try {
      const count = await sendTest(prefs.pushUrl.trim(), prefs.pushSecret.trim());
      Alert.alert('Test sent', count > 0 ? `Sent to ${count} device(s).` : 'No devices registered yet.');
    } catch (e: any) {
      Alert.alert('Test failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Notifications', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Push server</Text>
          <TextInput
            style={styles.input}
            value={prefs.pushUrl}
            onChangeText={v => patch({ ...prefs, pushUrl: v })}
            placeholder="http://192.168.1.10:8099"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!enabled}
          />
          <TextInput
            style={styles.input}
            value={prefs.pushSecret}
            onChangeText={v => patch({ ...prefs, pushSecret: v })}
            placeholder="Registration secret"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!enabled}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Notifications on this device</Text>
              <Text style={styles.toggleDesc}>
                Registers this device with your homelab. Turning it off unregisters it.
              </Text>
            </View>
            <Switch value={enabled} onValueChange={toggle} disabled={busy} />
          </View>
        </View>

        {enabled ? (
          <TouchableOpacity style={styles.button} onPress={test} disabled={busy}>
            <Text style={styles.buttonText}>Send a test notification</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.note}>
          Your homelab pushes a notification whenever Radarr or Sonarr finishes
          importing something, plus Seerr request updates. The server address is
          the machine running jellylab-push on port 8099, and the secret is
          PUSH_REGISTER_SECRET from its .env. Off your home network this needs
          the VPN connected, the same as everything else.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  cardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleLabel: { ...type.bodyStrong, color: colors.text },
  toggleDesc: { ...type.small, color: colors.textMuted, marginTop: 2 },
  button: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  buttonText: { ...type.bodyStrong, color: colors.text },
  note: { ...type.small, color: colors.textMuted, lineHeight: 18 },
});
