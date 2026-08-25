import { Stack } from 'expo-router';

import { colors } from '@/theme';

/**
 * The search tab gets a stack of its own.
 *
 * Not for navigation - it holds one screen - but because the native search
 * field is a property of a stack header, and `Stack.Toolbar.SearchBarSlot` is
 * what moves it into the bottom toolbar on iOS 26. Inside the tabs layout there
 * was no stack to attach either to.
 *
 * The header is transparent and titleless: this screen draws its own heading,
 * and the only thing wanted from the stack is the search field.
 */
export default function SearchLayout() {
  return (
    <Stack
      screenOptions={{
        title: '',
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    />
  );
}
