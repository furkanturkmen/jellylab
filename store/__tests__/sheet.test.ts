import { clearSeasonSheet, openSeasonSheet, pendingSeasonSheet } from '../sheet';
import { clearPlayerSheet, openPlayerSheet, pendingPlayerSheet } from '../playerSheet';

describe('season sheet handoff', () => {
  afterEach(() => clearSeasonSheet());

  it('has nothing pending until a screen opens one', () => {
    expect(pendingSeasonSheet()).toBeNull();
  });

  it('hands the sheet what the screen put there', () => {
    const onConfirm = jest.fn();
    openSeasonSheet({ seasons: [], initial: [1, 2], onConfirm });
    expect(pendingSeasonSheet()?.initial).toEqual([1, 2]);
    pendingSeasonSheet()?.onConfirm([1]);
    expect(onConfirm).toHaveBeenCalledWith([1]);
  });

  // The callback closes over the screen that created it, so a stale one is a
  // screen that cannot be collected.
  it('lets go of the callback when cleared', () => {
    openSeasonSheet({ seasons: [], initial: [], onConfirm: jest.fn() });
    clearSeasonSheet();
    expect(pendingSeasonSheet()).toBeNull();
  });

  it('keeps only the most recent request', () => {
    openSeasonSheet({ seasons: [], initial: [1], onConfirm: jest.fn() });
    openSeasonSheet({ seasons: [], initial: [9], onConfirm: jest.fn() });
    expect(pendingSeasonSheet()?.initial).toEqual([9]);
  });
});

describe('player sheet handoff', () => {
  afterEach(() => clearPlayerSheet());

  it('carries the kind the sheet switches on', () => {
    openPlayerSheet({ kind: 'speed', current: 1, rates: [1, 2], onPick: jest.fn() });
    expect(pendingPlayerSheet()?.kind).toBe('speed');
  });

  // Only one sheet is ever open, so a second request replaces the first rather
  // than queueing behind it.
  it('keeps only the most recent request', () => {
    openPlayerSheet({ kind: 'speed', current: 1, rates: [1], onPick: jest.fn() });
    openPlayerSheet({ kind: 'speed', current: 2, rates: [2], onPick: jest.fn() });
    expect(pendingPlayerSheet()?.current).toBe(2);
  });

  // The callback closes over a mounted player, so a stale one keeps the player
  // alive after the sheet is gone.
  it('lets go of the callback when cleared', () => {
    openPlayerSheet({ kind: 'speed', current: 1, rates: [1], onPick: jest.fn() });
    clearPlayerSheet();
    expect(pendingPlayerSheet()).toBeNull();
  });
});
