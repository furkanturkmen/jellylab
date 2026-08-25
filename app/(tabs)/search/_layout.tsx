import { Stack } from 'expo-router';

import { colors } from '@/theme';

/**
 * The search tab gets a stack of its own.
 *
 * Not for navigation - it holds one screen - but because the native search
 * field is a property of a stack header, and inside the tabs layout there was
 * no stack to attach one to. On iOS 26 the search tab then lifts the field out
 * of this header and into the bottom bar itself.
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
