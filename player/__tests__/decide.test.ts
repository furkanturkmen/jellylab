import { decideEngine, decidePlayback } from '../decide';
import type { MediaSource } from '@/api/jellyfin';

/**
 * The playback decision is the one piece of logic in this app that is both
 * pure and consequential: get it wrong and a file plays with no sound, or the
 * server transcodes when it did not have to. It has no UI of its own, so a
 * wrong answer only shows up as a black screen on a phone.
 */

function source(partial: Partial<MediaSource>): MediaSource {
  return { Container: 'mp4', MediaStreams: [], ...partial } as MediaSource;
}

const video = (codec: string) => ({ Type: 'Video', Codec: codec });
const audio = (codec: string) => ({ Type: 'Audio', Codec: codec });

describe('decideEngine', () => {
  it('keeps AVPlayer for an mp4 of h264 and aac', () => {
    expect(decideEngine([source({ MediaStreams: [video('h264'), audio('aac')] as any })])).toBe('native');
  });

  it('hands an mkv to VLC whatever is inside it', () => {
    expect(decideEngine([source({ Container: 'mkv', MediaStreams: [video('h264'), audio('aac')] as any })])).toBe('vlc');
  });

  it('hands anime audio to VLC - flac and opus are the usual pair', () => {
    expect(decideEngine([source({ MediaStreams: [video('h264'), audio('flac')] as any })])).toBe('vlc');
    expect(decideEngine([source({ MediaStreams: [video('h264'), audio('opus')] as any })])).toBe('vlc');
  });

  it('hands VP9 and AV1 to VLC', () => {
    expect(decideEngine([source({ MediaStreams: [video('vp9')] as any })])).toBe('vlc');
    expect(decideEngine([source({ MediaStreams: [video('av1')] as any })])).toBe('vlc');
  });

  it('reads only the first container when the server lists several', () => {
    // Jellyfin reports "mp4,m4v" for some remuxes; splitting on the comma is
    // what stops that being treated as an unknown container.
    expect(decideEngine([source({ Container: 'mp4,m4v' })])).toBe('native');
  });

  it('does not guess from missing information', () => {
    expect(decideEngine([])).toBe('native');
    expect(decideEngine([source({ Container: '', MediaStreams: [] })])).toBe('native');
    // A stream with no codec named is not evidence of anything.
    expect(decideEngine([source({ MediaStreams: [video('')] as any })])).toBe('native');
  });

  it('ignores case, which the server does not normalise', () => {
    expect(decideEngine([source({ Container: 'MP4', MediaStreams: [video('H264')] as any })])).toBe('native');
    expect(decideEngine([source({ Container: 'MKV' })])).toBe('vlc');
  });
});

describe('decidePlayback', () => {
  const heavy = source({ Bitrate: 20_000_000, MediaStreams: [video('h264'), audio('aac')] as any });

  it('direct plays when under the ceiling', () => {
    expect(decidePlayback([heavy], 25)).toEqual({ engine: 'native', mode: 'direct' });
  });

  it('transcodes when over it, and says at what rate', () => {
    expect(decidePlayback([heavy], 8)).toEqual({
      engine: 'native',
      mode: 'transcode',
      maxBitrate: 8_000_000,
    });
  });

  it('treats a ceiling of zero as unlimited', () => {
    expect(decidePlayback([heavy], 0).mode).toBe('direct');
  });

  it('does not transcode on an unknown source bitrate', () => {
    // "Cannot tell" must not become "make the server work" - that would put
    // every item with missing metadata through the CPU.
    const unknown = source({ MediaStreams: [video('h264')] as any });
    expect(decidePlayback([unknown], 2).mode).toBe('direct');
  });

  it('transcodes to a format AVPlayer can take, even for an mkv', () => {
    // The transcode is HLS h264/aac, so the engine flips back to native - this
    // is what gives the transcode path AirPlay and better battery.
    const mkv = source({ Container: 'mkv', Bitrate: 30_000_000 });
    expect(decidePlayback([mkv], 4)).toEqual({
      engine: 'native',
      mode: 'transcode',
      maxBitrate: 4_000_000,
    });
    // ...but the same file under the ceiling stays with VLC.
    expect(decidePlayback([mkv], 50)).toEqual({ engine: 'vlc', mode: 'direct' });
  });

  it('rounds a fractional ceiling rather than passing a float on', () => {
    expect(decidePlayback([heavy], 1.5).maxBitrate).toBe(1_500_000);
  });
});

describe('decidePlayback with a forced engine', () => {
  const mkv: any = { Container: 'mkv', Bitrate: 5_000_000, MediaStreams: [{ Type: 'Video', Codec: 'hevc' }] };
  const mp4: any = { Container: 'mp4', Bitrate: 5_000_000, MediaStreams: [{ Type: 'Video', Codec: 'h264' }] };

  it('transcodes for AVPlayer when the file is one it cannot open', () => {
    // Handing AVPlayer the mkv is what made "Always use AVPlayer" look ignored:
    // it failed on the first frame and the screen fell back to VLC in silence.
    expect(decidePlayback([mkv], 0, 'native')).toEqual({
      engine: 'native',
      mode: 'transcode',
      maxBitrate: 20_000_000,
    });
  });

  it('leaves a playable file alone when AVPlayer is forced', () => {
    expect(decidePlayback([mp4], 0, 'native')).toEqual({ engine: 'native', mode: 'direct' });
  });

  it('respects the user ceiling when it has to transcode anyway', () => {
    expect(decidePlayback([mkv], 4, 'native').maxBitrate).toBe(4_000_000);
  });

  it('never transcodes for VLC, which can open the file as it is', () => {
    expect(decidePlayback([mkv], 0, 'vlc')).toEqual({ engine: 'vlc', mode: 'direct' });
    expect(decidePlayback([mp4], 0, 'vlc')).toEqual({ engine: 'vlc', mode: 'direct' });
  });

  it('still lets the file decide when nothing is forced', () => {
    expect(decidePlayback([mkv], 0).engine).toBe('vlc');
    expect(decidePlayback([mp4], 0).engine).toBe('native');
  });
});
