import { Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * An iPad, which is the only device this app treats differently.
 *
 * Lives here rather than beside its first use because orientation is decided
 * in two places that must agree: the root stack declares what the app as a
 * whole supports, and the player screen declares its own. Two copies of this
 * test drifting apart would leave the app in an orientation no screen asked
 * for.
 */
export const IS_TABLET = Platform.OS === 'ios' && Platform.isPad;

/**
 * Whether iOS will draw liquid glass for us. Needs iOS 26.
 *
 * Here for the same reason as IS_TABLET: the player sheet and the route that
 * presents it both branch on it, and they have to agree. If the route made the
 * background transparent while the sheet decided to draw no glass, the result
 * would be unreadable text floating over a running film.
 *
 * Asked once at module scope - the answer cannot change while the app runs,
 * and it has to be settled before anything paints.
 */
export const HAS_LIQUID_GLASS = isLiquidGlassAvailable();
