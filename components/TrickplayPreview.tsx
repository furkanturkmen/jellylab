import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { trickplayTileUrl } from '@/api/jellyfin';
import { type TrickplayInfo } from '@/lib/trickplay';
import { colors, radius } from '@/theme';

/** How wide the preview is drawn, in points. */
export const PREVIEW_WIDTH = 176;

/**
 * One frame, cropped out of a trickplay sheet.
 *
 * The server serves sheets of a hundred thumbnails rather than single images,
 * so this draws the whole sheet inside a one-thumbnail window and slides it
 * until the wanted cell is in view. A scrub across a sheet is therefore one
 * request and ninety-nine crops of what is already cached.
 *
 * Three things keep a drag at sixty frames:
 *
 * - the slide is a `transform`, not `left`/`top`, so moving it never triggers
 *   a layout pass - and this moves on every pointer event;
 * - the component takes a cell rather than a time, and is memoised on it, so
 *   a drag that has not crossed into the next thumbnail does not re-render a
 *   3200px image at all;
 * - it is drawn smaller than the source. The thumbnails are 320px wide, so at
 *   full width on a 3x screen they are upscaled and soft as well as costly.
 */
function TrickplayPreviewImpl({ itemId, info, token, tileIndex, x, y }: {
  itemId: string;
  info: TrickplayInfo;
  token: string;
  /** Which sheet, and the cell within it - see lib/trickplay. */
  tileIndex: number;
  x: number;
  y: number;
}) {
  const scale = PREVIEW_WIDTH / info.width;
  const height = info.height * scale;

  return (
    <View style={[styles.window, { width: PREVIEW_WIDTH, height }]}>
      <Image
        source={{ uri: trickplayTileUrl(itemId, info.width, tileIndex, token) }}
        style={{
          width: info.width * info.tileWidth * scale,
          height: info.height * info.tileHeight * scale,
          transform: [
            { translateX: -x * PREVIEW_WIDTH },
            { translateY: -y * height },
          ],
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
}

export const TrickplayPreview = memo(TrickplayPreviewImpl);

const styles = StyleSheet.create({
  window: {
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
