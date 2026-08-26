import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { trickplayTileUrl } from '@/api/jellyfin';
import { trickplayTileAt, type TrickplayInfo } from '@/lib/trickplay';
import { colors, radius } from '@/theme';

/**
 * The frame at a given moment, cropped out of a trickplay sheet.
 *
 * The server does not serve single thumbnails - it serves sheets of a hundred,
 * so this draws the whole sheet inside a window one thumbnail wide and slides
 * it so the wanted cell lands in view. Scrubbing across a sheet is therefore
 * one request and ninety-nine crops of what is already in the image cache,
 * which is what makes it feel instant on a phone.
 *
 * `cachePolicy` is memory-and-disk on purpose: the sheets are small, and a
 * scrub back and forth over the same stretch should not go to the network
 * twice.
 */
export function TrickplayPreview({ itemId, info, token, seconds }: {
  itemId: string;
  info: TrickplayInfo;
  token: string;
  seconds: number;
}) {
  const cell = trickplayTileAt(seconds, info);
  if (!cell) return null;

  return (
    <View style={[styles.window, { width: info.width, height: info.height }]}>
      <Image
        source={{ uri: trickplayTileUrl(itemId, info.width, cell.tileIndex, token) }}
        style={{
          position: 'absolute',
          left: -cell.x * info.width,
          top: -cell.y * info.height,
          width: info.width * info.tileWidth,
          height: info.height * info.tileHeight,
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
