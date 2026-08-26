import { pickTrickplay, trickplayTileAt, type TrickplayInfo } from '../trickplay';

/** What the server generates for our libraries: 320px, 10x10 sheets, every 10s. */
const info: TrickplayInfo = {
  width: 320,
  height: 180,
  tileWidth: 10,
  tileHeight: 10,
  thumbnailCount: 250,
  interval: 10_000,
};

describe('trickplayTileAt', () => {
  it('puts the start of the film in the first cell', () => {
    expect(trickplayTileAt(0, info)).toEqual({ tileIndex: 0, x: 0, y: 0 });
  });

  it('holds the same thumbnail for the whole interval', () => {
    expect(trickplayTileAt(9.99, info)).toEqual({ tileIndex: 0, x: 0, y: 0 });
    expect(trickplayTileAt(10, info)).toEqual({ tileIndex: 0, x: 1, y: 0 });
  });

  it('wraps across a row', () => {
    // thumbnail 10 is the start of the second row, not the second sheet
    expect(trickplayTileAt(100, info)).toEqual({ tileIndex: 0, x: 0, y: 1 });
  });

  it('moves to the next sheet after a full tile', () => {
    // 100 thumbnails per sheet, so thumbnail 100 = 1000s
    expect(trickplayTileAt(1000, info)).toEqual({ tileIndex: 1, x: 0, y: 0 });
    expect(trickplayTileAt(1009, info)).toEqual({ tileIndex: 1, x: 0, y: 0 });
    expect(trickplayTileAt(1010, info)).toEqual({ tileIndex: 1, x: 1, y: 0 });
  });

  it('clamps past the end to the last thumbnail', () => {
    // 250 thumbnails: the last is index 249 -> sheet 2, cell (9, 4)
    expect(trickplayTileAt(99_999, info)).toEqual({ tileIndex: 2, x: 9, y: 4 });
  });

  it('treats a negative scrub as the start', () => {
    expect(trickplayTileAt(-5, info)).toEqual({ tileIndex: 0, x: 0, y: 0 });
  });

  it('gives up rather than dividing by zero', () => {
    expect(trickplayTileAt(10, { ...info, interval: 0 })).toBeNull();
    expect(trickplayTileAt(10, { ...info, thumbnailCount: 0 })).toBeNull();
    expect(trickplayTileAt(10, { ...info, tileWidth: 0 })).toBeNull();
  });
});

describe('pickTrickplay', () => {
  const w320 = { ...info, width: 320 };
  const w640 = { ...info, width: 640 };

  it('finds nothing in nothing', () => {
    expect(pickTrickplay(null)).toBeNull();
    expect(pickTrickplay({})).toBeNull();
  });

  it('takes the widest that still fits', () => {
    expect(pickTrickplay({ '320': w320, '640': w640 }, 640)?.width).toBe(640);
    expect(pickTrickplay({ '320': w320, '640': w640 }, 320)?.width).toBe(320);
  });

  it('would rather scale one down than show none', () => {
    expect(pickTrickplay({ '640': w640 }, 320)?.width).toBe(640);
  });
});
