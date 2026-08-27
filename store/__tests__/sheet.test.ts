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

function vlcTracksRequest() {
  return {
    kind: 'vlcTracks' as const,
    externalSubs: [{ index: 0, label: 'English' }],
    internalTracks: [],
    activeExternalIndex: null,
    activeInternalId: -1,
    subDelayMs: 0,
    delayEnabled: false,
    onDelayChange: jest.fn(),
    onPickExternal: jest.fn(),
    onPickInternal: jest.fn(),
    onOff: jest.fn(),
    audioTracks: [{ id: 1, label: 'Japanese' }],
    activeAudioId: 1,
    declaredAudioCount: 1,
    onPickAudio: jest.fn(),
  };
}

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
    openPlayerSheet(vlcTracksRequest());
    expect(pendingPlayerSheet()?.kind).toBe('vlcTracks');
  });

  // Audio and subtitles travel as one request: the sheet shows both lists, so
  // splitting them would mean the picker could open with half its content.
  it('carries both track lists in one request', () => {
    openPlayerSheet(vlcTracksRequest());
    const req = pendingPlayerSheet();
    expect(req?.kind).toBe('vlcTracks');
    if (req?.kind !== 'vlcTracks') throw new Error('wrong kind');
    expect(req.audioTracks).toEqual([{ id: 1, label: 'Japanese' }]);
    expect(req.externalSubs).toEqual([{ index: 0, label: 'English' }]);
  });

  it('lets go of the player handle when cleared', () => {
    openPlayerSheet({ kind: 'tracks', player: {}, externalSubs: [], activeExternalSubIndex: null, onPickExternal: jest.fn() });
    clearPlayerSheet();
    expect(pendingPlayerSheet()).toBeNull();
  });
});
