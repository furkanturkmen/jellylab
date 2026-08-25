import type { ReactNode } from 'react';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import * as Jellyfin from '@/api/jellyfin';
import { useAuth } from '@/hooks/useAuth';
import { logRequestFailure } from '@/lib/errorLog';
import type { JellyfinItem } from '@/types';

/**
 * A poster that answers a long press.
 *
 * Every card in the app was a Touchable inside a Link: one gesture, one
 * destination. iOS has had a second gesture on exactly this kind of tile for
 * years - press and hold for a peek at where you are going, with the actions
 * you would otherwise have to open the screen to reach.
 *
 * `Link.Preview` renders the destination route itself, so the peek is the real
 * item screen rather than a picture of one, and letting go pushes the screen
 * that is already there. The menu covers the two things worth doing to a card
 * without opening it: start it, and correct its watched state.
 *
 * `onChanged` is how the shelf hears about the second one - the card does not
 * own the list it is in, and a tick that only appears after a manual refresh
 * reads as a failed tap.
 */
export function ItemLink({ item, onChanged, children }: {
  item: JellyfinItem;
  /** Told the new state, so a list can show it without asking the server again. */
  onChanged?: (played: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { state } = useAuth();

  const played = item.UserData?.Played === true;
  const resumable = (item.UserData?.PlaybackPositionTicks ?? 0) > 0;

  async function togglePlayed() {
    if (state.status !== 'signed-in') return;
    try {
      await Jellyfin.setPlayed(state.auth.userId, item.Id, !played);
      onChanged?.(!played);
    } catch (e) {
      logRequestFailure('itemLink:setPlayed', e);
    }
  }

  return (
    <Link href={`/item/${item.Id}`}>
      <Link.Trigger>{children}</Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {/* Apple names the action after what it does, so a part-watched item
            offers Resume - the same wording the item screen's button uses. */}
        <Link.MenuAction
          title={resumable ? t('detail.resume') : t('detail.play')}
          icon="play.fill"
          onPress={() => router.push(`/item/${item.Id}?play=1`)}
        />
        <Link.MenuAction
          title={played ? t('menu.markUnwatched') : t('menu.markWatched')}
          icon={played ? 'eye.slash' : 'checkmark.circle'}
          onPress={togglePlayed}
        />
      </Link.Menu>
    </Link>
  );
}
