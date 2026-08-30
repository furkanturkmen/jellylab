import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { QualityProfile } from '@/api/jellyseerr';
import { colors, radius, spacing, type as t } from '@/theme';

/**
 * Which quality profile a title should use.
 *
 * A title is one object in Radarr or Sonarr holding exactly one profile, so
 * this chooses what that object *seeks* - it never produces a second copy of
 * anything, and an upgrade replaces the file rather than adding one. (The one
 * arrangement that does duplicate is a separate 4K server, which this setup
 * does not have.)
 *
 * Rendered only when there is a real choice: an account without Seerr's
 * advanced-request permission gets no profiles back, and a single profile is
 * not a decision worth a control.
 */
export function QualityPicker({
  profiles,
  selected,
  onSelect,
}: {
  profiles: QualityProfile[];
  selected: number | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (profiles.length < 2) return null;

  const current = profiles.find(p => p.id === selected)
    ?? profiles.find(p => p.isDefault)
    ?? profiles[0];

  return (
    <>
      <TouchableOpacity style={styles.row} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={styles.label}>{t('request.quality')}</Text>
        <Text style={styles.value} numberOfLines={1}>{current.name}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('request.quality')}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.close}>{t('common.close', { defaultValue: 'Close' })}</Text>
              </TouchableOpacity>
            </View>
            {/* Said once, here, rather than trusted to be obvious: the fear
                this control invites is that picking a quality makes a second
                copy appear in the library. It cannot. */}
            <Text style={styles.note}>{t('request.qualityNote')}</Text>
            <ScrollView contentContainerStyle={styles.list}>
              {profiles.map(p => {
                const active = p.id === current.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      // The default is sent as "no choice at all", so a request
                      // that wants the server default carries no profile id and
                      // keeps working if that default is ever changed.
                      onSelect(p.isDefault ? undefined : p.id);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {p.name}
                    </Text>
                    {p.isDefault ? <Text style={styles.default}>{t('request.qualityDefault')}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { ...t.small, color: colors.textMuted },
  value: { ...t.small, color: colors.text, flex: 1, textAlign: 'right' },
  chevron: { ...t.body, color: colors.textDim },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '70%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: { ...t.h2, color: colors.text, flex: 1 },
  close: { ...t.body, color: colors.textMuted },
  note: { ...t.small, color: colors.textDim, marginBottom: spacing.lg },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionActive: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  optionText: { ...t.body, color: colors.textMuted, flex: 1 },
  optionTextActive: { color: colors.text, fontWeight: '600' },
  default: { ...t.caption, color: colors.textDim },
});
