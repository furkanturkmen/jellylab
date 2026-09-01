import { Alert } from 'react-native';

import i18n from '@/i18n';
import { formatBytes } from '@/lib/bytes';
import { checkCap, GB, toEvict } from '@/lib/downloadSpace';

import { removeDownload, storedForCapSync } from './downloads';
import { loadPrefs } from './prefs';

/**
 * Ask before a download crosses the storage cap.
 *
 * Lives outside the screens because two of them start downloads - the item
 * screen and the season list - and a dialog written twice is a dialog that
 * drifts.
 *
 * It asks rather than deciding. `docs/downloads.md` is explicit that this is
 * not a sync engine: "You pick a thing, it is stored, you delete it". An
 * automatic policy would reclaim the least-recently-touched file, which is
 * precisely the season downloaded the night before a flight and not yet
 * opened - the one file the whole feature exists to protect.
 *
 * Resolves true when the download should go ahead. Anything it cannot answer
 * confidently resolves true as well: a guard that blocks downloads because a
 * preference failed to load would be worse than no guard.
 */
export async function confirmSpace(neededBytes: number): Promise<boolean> {
  const t = i18n.t.bind(i18n);

  let capGb: number;
  try {
    capGb = (await loadPrefs()).downloadCapGb;
  } catch {
    return true;
  }
  // Zero or less is the way to turn the cap off entirely.
  if (!(capGb > 0)) return true;

  const verdict = checkCap(storedForCapSync(), neededBytes, capGb);
  if (verdict.fits) return true;

  const usage = t('downloads.capUsage', {
    used: formatBytes(verdict.used),
    cap: `${capGb} GB`,
  });

  // Nothing watched to give back, so there is no button that would work. Say
  // that rather than offering one.
  if (verdict.hopeless) {
    return new Promise(resolve => {
      Alert.alert(
        t('downloads.capFullTitle'),
        `${usage}\n\n${t('downloads.capFullBody', { size: formatBytes(verdict.needed) })}`,
        [{ text: t('common.close'), onPress: () => resolve(false) }],
      );
    });
  }

  const evicting = toEvict(verdict);
  const freed = evicting.reduce((sum, s) => sum + s.bytes, 0);

  return new Promise(resolve => {
    Alert.alert(
      t('downloads.capTitle'),
      `${usage}\n\n${t('downloads.capBody', {
        count: evicting.length,
        size: formatBytes(freed),
        titles: evicting.map(s => s.title).join('\n'),
      })}`,
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: t('downloads.capFree'),
          style: 'destructive',
          onPress: async () => {
            for (const s of evicting) await removeDownload(s.itemId);
            resolve(true);
          },
        },
      ],
    );
  });
}

/** The cap as bytes, for the readouts that show it beside a total. */
export function capBytes(capGb: number): number {
  return Math.max(0, capGb) * GB;
}
