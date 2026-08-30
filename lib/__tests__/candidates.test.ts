import type { Candidates, Release } from '@/api/push';
import { suspicious, topReason, verdict } from '../candidates';

const release = (over: Partial<Release> = {}): Release => ({
  title: 'Fall.2022.1080p.WEBRip.DD5.1.x264-NOGRP',
  quality: 'WEBRip-1080p',
  proper: false,
  score: 15,
  seeders: 1813,
  leechers: 207,
  size: 5_000_000_000,
  indexer: '1337x (Prowlarr)',
  languages: ['English'],
  age: 1459,
  ...over,
});

const answer = (over: Partial<Candidates> = {}): Candidates => ({
  tracked: true,
  found: 0,
  accepted: 0,
  releases: [],
  rejections: {},
  ...over,
});

describe('verdict', () => {
  it('separates a dead end from a wait', () => {
    // Bin Roye (2015): seven releases, five DVDRip, against a profile that
    // starts at 720p. No amount of searching will ever succeed, and the app
    // used to report this identically to a download in progress.
    expect(
      verdict(answer({
        found: 7,
        accepted: 0,
        rejections: { 'DVD is not wanted in profile': 5, 'CAM is not wanted in profile': 1 },
      })),
    ).toEqual({ kind: 'deadEnd', found: 7, reason: 'DVD is not wanted in profile' });

    // Fall (2022): plenty acceptable, so waiting is reasonable.
    const v = verdict(answer({ found: 256, accepted: 34, releases: [release()] }));
    expect(v.kind).toBe('grabbable');
  });

  it('does not call a finished download a dead end', () => {
    // Pinocchio: Unstrung downloaded, imported as a 1.52GB Bluray-1080p, and
    // then reported "48 found, none can be used - this will not resolve on its
    // own". Every remaining release was refused because the file on disk
    // already met the cutoff, which is success wearing the same clothes.
    expect(
      verdict(answer({
        found: 48,
        accepted: 0,
        rejections: { 'Existing file meets cutoff: WEB 1080p': 40 },
      })),
    ).toMatchObject({ kind: 'satisfied', found: 48 });

    // Same shape while something is still downloading.
    expect(
      verdict(answer({
        found: 256,
        accepted: 0,
        rejections: { 'Quality for release in queue already meets cutoff: WEBRip-1080p v1': 110 },
      })).kind,
    ).toBe('satisfied');
  });

  it('does not offer to reject a download that is running', () => {
    // No Game No Life, mid-download at 20%: 176 releases, 70 of them rejected
    // as a different show entirely. Counting those made "Unknown Series" the
    // headline and the sheet offered to reject a moving download.
    const v = verdict(answer({
      found: 176,
      accepted: 0,
      rejections: {
        'Unknown Series': 70,
        'Release in queue already meets cutoff: Bluray-1080p v1': 51,
        'Not enough seeders: 0. Minimum seeders: 1': 34,
      },
    }));
    expect(v.kind).toBe('satisfied');
    expect(v).toMatchObject({ reason: expect.stringContaining('in queue') });
  });

  it('ignores rejections about other titles when ranking the reason', () => {
    // "Unknown Series" describes releases that are not this show. It says
    // nothing about whether this one can be had, however many there are.
    expect(topReason({ 'Unknown Series': 70, 'DVD is not wanted in profile': 5 }))
      .toBe('DVD is not wanted in profile');
  });

  it('falls back to noise when there is nothing else', () => {
    // Better than a blank: at least it says the search matched nothing real.
    expect(topReason({ 'Unknown Movie. Unable to match': 12 }))
      .toBe('Unknown Movie. Unable to match');
  });

  it('still calls a real dead end a dead end', () => {
    // An unrecognised reason must fall through to the louder answer rather
    // than being quietly treated as success.
    expect(
      verdict(answer({ found: 7, accepted: 0, rejections: { 'Some new reason': 3 } })).kind,
    ).toBe('deadEnd');
  });

  it('tells "never added" apart from "nothing found"', () => {
    // Both show no releases; only one of them is worth fixing by requesting it
    // again, and the other by waiting.
    expect(verdict(answer({ tracked: false })).kind).toBe('untracked');
    expect(verdict(answer({ found: 0 })).kind).toBe('nothing');
  });

  it('is a dead end when the count and the list disagree', () => {
    // Defensive: a server that says something is acceptable but sends no rows
    // leaves nothing to show, and claiming grabbable would render a blank.
    expect(verdict(answer({ found: 9, accepted: 4, releases: [] })).kind).toBe('deadEnd');
  });

  it('trusts the count over the list length', () => {
    // The server caps `releases` at ten, so on any well-supplied title the two
    // disagree. Reporting the list length would say "10 acceptable" forever.
    const v = verdict(answer({ found: 256, accepted: 34, releases: [release()] }));
    expect(v).toMatchObject({ accepted: 34 });
  });
});

describe('topReason', () => {
  it('picks the commonest', () => {
    expect(topReason({ 'DVD is not wanted in profile': 5, 'CAM is not wanted in profile': 1 }))
      .toBe('DVD is not wanted in profile');
  });

  it('says nothing when there is nothing to say', () => {
    expect(topReason({})).toBeNull();
  });
});

describe('suspicious', () => {
  it('flags the combination that beat 1813 seeders with 24', () => {
    // Fall 2022 PROPER 1080p WEBRip x265 RARBG: scored -20, ranked first
    // anyway because PROPER outranks score, and contained an .exe.
    expect(suspicious(release({ proper: true, score: -20 }))).toBe(true);
  });

  it('leaves an ordinary proper alone', () => {
    expect(suspicious(release({ proper: true, score: 15 }))).toBe(false);
    expect(suspicious(release({ proper: false, score: -20 }))).toBe(false);
  });
});
