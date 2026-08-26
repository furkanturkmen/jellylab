import { qualityFromHeight, qualityFromLabel } from '../quality';

describe('qualityFromHeight', () => {
  it('names the usual heights', () => {
    expect(qualityFromHeight(2160)).toBe('quality.4k');
    expect(qualityFromHeight(1080)).toBe('quality.fullHd');
    expect(qualityFromHeight(720)).toBe('quality.hd');
    expect(qualityFromHeight(480)).toBe('quality.sd');
  });

  // A scope film is 1920 wide and 804 tall, and calling that HD would be wrong
  // to everyone who watches it.
  it('treats a letterboxed film by the band it belongs to', () => {
    expect(qualityFromHeight(804)).toBe('quality.hd');
    expect(qualityFromHeight(1600)).toBe('quality.fullHd');
  });

  it('says nothing when the server said nothing', () => {
    expect(qualityFromHeight(undefined)).toBeNull();
    expect(qualityFromHeight(0)).toBeNull();
  });
});

describe('qualityFromLabel', () => {
  // The strings this exists to translate, verbatim from the two servers.
  it('reads what Jellyfin and Radarr write', () => {
    expect(qualityFromLabel('Presented By EMBER - 1080p - HEVC - SDR')).toBe('quality.fullHd');
    expect(qualityFromLabel('WEBRip-1080p v1')).toBe('quality.fullHd');
    expect(qualityFromLabel('Bluray-2160p')).toBe('quality.4k');
    expect(qualityFromLabel('HDTV-720p')).toBe('quality.hd');
    expect(qualityFromLabel('WEBDL-480p')).toBe('quality.sd');
  });

  it('falls back to a bare number', () => {
    expect(qualityFromLabel('1080')).toBe('quality.fullHd');
  });

  it('has nothing to say about a name with no resolution in it', () => {
    expect(qualityFromLabel('Golumpa@CR - English - AAC')).toBeNull();
    expect(qualityFromLabel('')).toBeNull();
  });
});
