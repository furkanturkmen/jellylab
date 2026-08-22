import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { CONFIG } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { loadPrefs, savePrefs, type Prefs } from '@/store/prefs';
import { colors, radius, spacing, type } from '@/theme';

export default function ContentSettings() {
  const { state } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    loadPrefs().then(setPrefs);
  }, []);

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePrefs(next);
  }

  const isAdmin = state.status === 'signed-in' && state.auth.isAdmin;

  if (!prefs) {
    return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Content', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerTitleStyle: { color: colors.text } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <ToggleRow
            label="Show adult content"
            description="Include 18+ movies and TV in Search and Discover. Applies on this device only. Your Jellyseerr server must also allow adult content globally for it to appear."
            value={prefs.includeAdult}
            onValueChange={v => update('includeAdult', v)}
          />
        </View>

        {isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Admin — Jellyseerr server</Text>
            <Text style={styles.note}>
              The device toggle above only hides adult results on this phone. To control it for the whole server (and per user), open Jellyseerr:
            </Text>
            <TouchableOpacity
              style={styles.linkRow}
              activeOpacity={0.75}
              onPress={() => WebBrowser.openBrowserAsync(`${CONFIG.JELLYSEERR_URL}/settings/main`)}
            >
              <Text style={styles.linkLabel}>Global settings</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkRow}
              activeOpacity={0.75}
              onPress={() => WebBrowser.openBrowserAsync(`${CONFIG.JELLYSEERR_URL}/users`)}
            >
              <Text style={styles.linkLabel}>Per-user permissions</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.note}>
            Only the device toggle is available for non-admin accounts. Server-wide adult content control lives in Jellyseerr's admin.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function ToggleRow({ label, description, value, onValueChange }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.toggleDesc}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.text, false: colors.surface }}
        thumbColor={colors.bg}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  rowLabel: { ...type.body, color: colors.text },
  toggleDesc: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 16 },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkLabel: { ...type.body, color: colors.text },
  menuArrow: { color: colors.textMuted, fontSize: 20 },
  note: { ...type.small, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 20 },
});
