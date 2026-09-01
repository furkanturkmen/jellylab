import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Button, Host, HStack, Menu } from '@expo/ui/swift-ui';

import { DATE_FILTERS, STATUS_FILTERS, type DateFilter, type StatusFilter } from '@/lib/requestFilters';
import { spacing } from '@/theme';

export type FilterUser = { id: number; displayName: string };

/**
 * The filter bar above the request list.
 *
 * Native menus rather than a row of pills: iOS already has a control for
 * "choose one of these and show me which", it collapses to the width of the
 * chosen value, and it reads correctly to VoiceOver without any of that being
 * rebuilt here.
 *
 * A menu shows its state with a checkmark on the chosen row, which is why the
 * options are Buttons rather than a Picker - this version of @expo/ui has no
 * `tag` modifier, so a Picker cannot say which of its children is selected.
 */
export function RequestFilters({
  status, onStatus,
  date, onDate,
  user, onUser,
  users,
}: {
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  date: DateFilter;
  onDate: (d: DateFilter) => void;
  user: number | 'all';
  onUser: (u: number | 'all') => void;
  /**
   * Everyone with a request in the list, or empty for an account that can only
   * see its own. Empty hides the menu entirely rather than showing a control
   * with one choice in it.
   */
  users: FilterUser[];
}) {
  const { t } = useTranslation();

  const statusLabel = (s: StatusFilter) => t(`requests.filter.status.${s}`);
  const dateLabel = (d: DateFilter) => t(`requests.filter.date.${d}`);
  const userLabel = (u: number | 'all') =>
    u === 'all' ? t('requests.filter.user.all') : users.find(x => x.id === u)?.displayName ?? String(u);

  return (
    <Host style={styles.host} matchContents colorScheme="dark">
      <HStack spacing={spacing.sm}>
        <Menu label={statusLabel(status)} systemImage="line.3.horizontal.decrease.circle">
          {STATUS_FILTERS.map(s => (
            <Button
              key={s}
              label={statusLabel(s)}
              systemImage={s === status ? 'checkmark' : undefined}
              onPress={() => onStatus(s)}
            />
          ))}
        </Menu>

        <Menu label={dateLabel(date)} systemImage="calendar">
          {DATE_FILTERS.map(d => (
            <Button
              key={d}
              label={dateLabel(d)}
              systemImage={d === date ? 'checkmark' : undefined}
              onPress={() => onDate(d)}
            />
          ))}
        </Menu>

        {users.length > 0 ? (
          <Menu label={userLabel(user)} systemImage="person.2">
            <Button
              label={t('requests.filter.user.all')}
              systemImage={user === 'all' ? 'checkmark' : undefined}
              onPress={() => onUser('all')}
            />
            {users.map(u => (
              <Button
                key={u.id}
                label={u.displayName}
                systemImage={u.id === user ? 'checkmark' : undefined}
                onPress={() => onUser(u.id)}
              />
            ))}
          </Menu>
        ) : null}
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding: the list already insets its content, and adding it
  // here indents the bar past the cards it filters.
  host: {
    paddingBottom: spacing.md,
  },
});
