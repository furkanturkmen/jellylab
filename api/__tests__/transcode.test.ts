import { transcodeParams } from '../jellyfin';

describe('transcodeParams', () => {
  const params = (max: number) => transcodeParams('src', 'token', 'device', max);

  // Without this the server hands ffmpeg "-b:v 0 -maxrate 0" under CBR, which
  // exits 234 on every segment - a stream that plays nowhere.
  it('states a video bitrate, not only a ceiling', () => {
    expect(params(8_000_000).get('VideoBitrate')).toBe('7808000');
    expect(params(8_000_000).get('MaxStreamingBitrate')).toBe('8000000');
  });

  it('takes the audio out of the ceiling rather than adding to it', () => {
    const p = params(8_000_000);
    const total = Number(p.get('VideoBitrate')) + Number(p.get('AudioBitrate'));
    expect(total).toBe(8_000_000);
  });

  // A 1 Mbps ceiling minus audio is still a real number; a 100 kbps one would
  // not be, and the floor is what stops that becoming another failed encode.
  it('never asks for a video bitrate too small to encode', () => {
    expect(Number(params(100_000).get('VideoBitrate'))).toBe(400_000);
  });

  it('asks for what AVPlayer can actually play', () => {
    const p = params(4_000_000);
    expect(p.get('VideoCodec')).toBe('h264');
    expect(p.get('AudioCodec')).toBe('aac');
    expect(p.get('TranscodingProtocol')).toBe('hls');
  });
});
