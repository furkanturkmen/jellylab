import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Button, Form, Host, HStack, Label, Menu, Section, Spacer, Text as UIText, TextField, Toggle,
} from '@expo/ui/swift-ui';
import { buttonStyle, scrollContentBackground, tint } from '@expo/ui/swift-ui/modifiers';

import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import * as Push from '@/api/push';
import { getJellyfinUrl } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { KIJKWIJZER, kijkwijzerLabel } from '@/lib/ratings';
import { loadPrefs } from '@/store/prefs';
import { colors, spacing } from '@/theme';

/**
 * Content filters: named bundles of keywords and an age cap, assigned to
 * people.
 *
 * Two things happen here and they are deliberately separate buttons. Saving
 * records the rules. Applying writes them into Jellyfin's per-user policy,
 * which is the only part any other client obeys - so it is the only part that
 * actually keeps anything away from anyone, and it asks first.
 */
export default function FiltersSettings() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const token = state.status === 'signed-in' ? state.auth.accessToken : '';
  const isAdmin = state.status === 'signed-in' && state.auth.isAdmin;

  const [url, setUrl] = useState('');
  const [doc, setDoc] = useState<Push.FilterDoc | null>(null);
  const [users, setUsers] = useState<Jellyfin.JellyfinUser[]>([]);
  // A non-admin has nothing to fetch, so it never starts in a loading state
  // and the effect below has nothing to correct.
  const [loading, setLoading] = useState(isAdmin);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [matches, setMatches] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const resolved = Push.resolveUrl((await loadPrefs()).pushUrl, getJellyfinUrl());
      setUrl(resolved);
      if (!resolved) return;
      const [d, u] = await Promise.all([
        Push.filters(resolved),
        // Administrator-only on Jellyfin's side; an empty list simply means no
        // per-person assignment can be offered.
        Jellyfin.getUsers().catch(() => [] as Jellyfin.JellyfinUser[]),
      ]);
      setDoc(d);
      setUsers(u.filter(x => !x.Policy?.IsAdministrator));
    } catch (e) {
      Alert.alert(t('filters.loadFailed'), e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Fetching on mount, for an admin. Setting state from the result is what the
  // effect exists to do.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function persist(next: Push.FilterDoc, alsoApply = false) {
    if (!url) return;
    setBusy(true);
    try {
      const saved = await Push.saveFilters(url, token, next);
      setDoc(saved);
      if (alsoApply) {
        const { applied } = await Push.applyFilters(url, token);
        Alert.alert(
          t('filters.appliedTitle'),
          applied.length === 0
            ? t('filters.appliedNobody')
            : applied
              .map(a => `${a.user}: ${a.blockedTags.length} ${t('filters.tagsWord')}`
                + (a.maxAge != null ? ` · ${kijkwijzerLabel(a.maxAge)}` : ''))
              .join('\n'),
        );
      }
    } catch (e) {
      Alert.alert(t('filters.saveFailed'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function lookup(q: string) {
    setDraft(q);
    if (q.trim().length < 2) { setMatches([]); return; }
    try {
      setMatches((await Jellyseerr.searchKeywords(q.trim())).slice(0, 8));
    } catch {
      setMatches([]);
    }
  }

  function addFilter() {
    if (!doc) return;
    const name = draft.trim() || t('filters.untitled');
    const id = `f${Date.now()}`;
    setDoc({ ...doc, filters: [...doc.filters, { id, name, keywords: [], maxAge: null }] });
    setEditing(id);
    setDraft('');
    setMatches([]);
  }

  function updateFilter(id: string, patch: Partial<Push.ContentFilter>) {
    if (!doc) return;
    setDoc({ ...doc, filters: doc.filters.map(f => (f.id === id ? { ...f, ...patch } : f)) });
  }

  function removeFilter(id: string) {
    if (!doc) return;
    const assignments: Record<string, string[]> = {};
    for (const [who, list] of Object.entries(doc.assignments)) {
      const kept = list.filter(x => x !== id);
      if (kept.length > 0) assignments[who] = kept;
    }
    setDoc({ ...doc, filters: doc.filters.filter(f => f.id !== id), assignments });
    if (editing === id) setEditing(null);
  }

  function toggleAssignment(who: string, id: string) {
    if (!doc) return;
    const current = doc.assignments[who] ?? [];
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    const assignments = { ...doc.assignments };
    if (next.length > 0) assignments[who] = next;
    else delete assignments[who];
    setDoc({ ...doc, assignments });
  }

  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('filters.title') }} />
        <Host style={styles.host} colorScheme="dark">
          <Form modifiers={[scrollContentBackground('hidden'), tint(colors.text)]}>
            <Section footer={<UIText>{t('filters.adminOnly')}</UIText>}>
              <UIText>{t('filters.title')}</UIText>
            </Section>
          </Form>
        </Host>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <Stack.Screen options={{ title: t('filters.title') }} />
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  const current = doc?.filters.find(f => f.id === editing) ?? null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('filters.title') }} />
      <Host style={styles.host} colorScheme="dark">
        <Form modifiers={[scrollContentBackground('hidden'), tint(colors.text)]}>

          {/* --------------------------------------------------- the filters */}
          <Section title={t('filters.yours')} footer={<UIText>{t('filters.note')}</UIText>}>
            {(doc?.filters ?? []).map(f => (
              <Button
                key={f.id}
                modifiers={[buttonStyle('plain')]}
                onPress={() => setEditing(editing === f.id ? null : f.id)}
              >
                <HStack spacing={12}>
                  <Label
                    title={f.name}
                    systemImage={editing === f.id ? 'chevron.down' : 'chevron.right'}
                  />
                  <Spacer />
                  <UIText>
                    {[
                      `${f.keywords?.length ?? 0} ${t('filters.tagsWord')}`,
                      f.maxAge != null ? kijkwijzerLabel(f.maxAge) : null,
                    ].filter(Boolean).join(' · ')}
                  </UIText>
                </HStack>
              </Button>
            ))}
            {(doc?.filters.length ?? 0) === 0 ? <UIText>{t('filters.none')}</UIText> : null}
          </Section>

          {/* ------------------------------------------------- add / keywords */}
          <Section title={current ? t('filters.editing', { name: current.name }) : t('filters.add')}>
            <TextField
              placeholder={current ? t('filters.keywordPlaceholder') : t('filters.namePlaceholder')}
              onTextChange={current ? lookup : setDraft}
            />
            {!current ? (
              <Button label={t('filters.addButton')} onPress={addFilter} />
            ) : null}
            {current ? matches.map(k => (
              <Button
                key={k.id}
                label={k.name}
                systemImage={current.keywords?.some(x => x.id === k.id) ? 'checkmark' : 'plus'}
                onPress={() => {
                  const have = current.keywords ?? [];
                  updateFilter(current.id, {
                    keywords: have.some(x => x.id === k.id)
                      ? have.filter(x => x.id !== k.id)
                      : [...have, k],
                  });
                }}
              />
            )) : null}
          </Section>

          {/* ----------------------------------------------------- age + flags */}
          {current ? (
            <Section title={t('filters.age')} footer={<UIText>{t('filters.ageNote')}</UIText>}>
              <Menu
                label={current.maxAge != null ? kijkwijzerLabel(current.maxAge)! : t('filters.noAge')}
                systemImage="person.crop.square"
              >
                <Button
                  label={t('filters.noAge')}
                  systemImage={current.maxAge == null ? 'checkmark' : undefined}
                  onPress={() => updateFilter(current.id, { maxAge: null })}
                />
                {KIJKWIJZER.map(k => (
                  <Button
                    key={k.age}
                    label={k.label}
                    systemImage={current.maxAge === k.age ? 'checkmark' : undefined}
                    onPress={() => updateFilter(current.id, { maxAge: k.age })}
                  />
                ))}
              </Menu>
              <Toggle
                label={t('filters.blockUnrated')}
                isOn={!!current.blockUnrated}
                onIsOnChange={(v: boolean) => updateFilter(current.id, { blockUnrated: v })}
              />
              <Button
                role="destructive"
                label={t('filters.remove')}
                onPress={() => removeFilter(current.id)}
              />
            </Section>
          ) : null}

          {/* ------------------------------------------------------ assignment */}
          {current ? (
            <Section title={t('filters.appliesTo')}>
              <Toggle
                label={t('filters.everyone')}
                isOn={(doc?.assignments[Push.EVERYONE] ?? []).includes(current.id)}
                onIsOnChange={() => toggleAssignment(Push.EVERYONE, current.id)}
              />
              {users.map(u => (
                <Toggle
                  key={u.Id}
                  label={u.Name}
                  isOn={(doc?.assignments[u.Id] ?? []).includes(current.id)}
                  onIsOnChange={() => toggleAssignment(u.Id, current.id)}
                />
              ))}
            </Section>
          ) : null}

          {/* ---------------------------------------------------------- saving */}
          <Section footer={<UIText>{t('filters.applyNote')}</UIText>}>
            <Button
              label={busy ? t('filters.saving') : t('filters.save')}
              onPress={() => doc && persist(doc)}
            />
            <Button
              label={t('filters.apply')}
              onPress={() => {
                if (!doc) return;
                Alert.alert(t('filters.applyTitle'), t('filters.applyBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('filters.apply'), onPress: () => persist(doc, true) },
                ]);
              }}
            />
          </Section>
        </Form>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  host: { flex: 1, paddingTop: spacing.sm },
});
