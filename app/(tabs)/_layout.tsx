import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme';

/**
 * iOS draws the tab bar, not us.
 *
 * What was here before was a hand-built floating bar: a glass pill holding
 * three tabs, a detached search circle that morphed into a full-width field,
 * and a Reanimated layout transition tying the two together. It looked close to
 * the system one and behaved slightly differently - it did not know about the
 * keyboard on its own, it could not do the iOS 26 search-tab treatment, and
 * every OS release was a new chance for the resemblance to slip.
 *
 * NativeTabs is a SwiftUI TabView underneath, so the material, the selection
 * animation and the safe-area behaviour are the platform's. The search tab is
 * declared with role="search", which is what puts it apart on the right and
 * gives it the system's own field.
 *
 * The screens are unchanged: same routes, same order.
 */
export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <NativeTabs
      // The app is dark whatever the phone is set to, so the bar is told rather
      // than left to guess.
      blurEffect="systemChromeMaterialDark"
      tintColor={colors.text}
      labelStyle={{ default: { color: colors.textMuted }, selected: { color: colors.text } }}
      iconColor={{ default: colors.textMuted, selected: colors.text }}
    >
      <NativeTabs.Trigger name="index">
        {/* Filled on selection is the platform convention, and the one the
            hand-built bar already followed. */}
        <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} drawable="video_library" />
        <NativeTabs.Trigger.Label>{t('tabs.library')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="requests">
        <NativeTabs.Trigger.Icon sf={{ default: 'paperplane', selected: 'paperplane.fill' }} drawable="inbox" />
        <NativeTabs.Trigger.Label>{t('tabs.requests')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="downloads">
        <NativeTabs.Trigger.Icon sf={{ default: 'arrow.down.circle', selected: 'arrow.down.circle.fill' }} drawable="download" />
        <NativeTabs.Trigger.Label>{t('tabs.downloads')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* role="search" is why this sits apart from the others and behaves the
          way the search tab does everywhere else on the system. */}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" drawable="search" />
        <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
