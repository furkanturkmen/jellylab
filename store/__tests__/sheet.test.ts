import { clearSeasonSheet, openSeasonSheet, pendingSeasonSheet } from '../sheet';

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
