import { Platform } from 'react-native';

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
