/**
 * Picture quality in words people use, not in words servers use.
 *
 * Jellyfin says "Presented By EMBER - 1080p - HEVC - SDR" and Radarr says
 * "WEBRip-1080p v1"; both are describing something anyone would call Full HD.
 * This turns a height, or one of those strings, into the name on a television
 * box - and the caller translates that name, so it is a key rather than a
 * word.
 *
 * Deliberately coarse. "Full HD" is the useful answer; whether it came from a
 * web rip or a Bluray is a question nobody watching has ever asked.
 */
export type QualityKey =
  | 'quality.4k'
  | 'quality.fullHd'
  | 'quality.hd'
  | 'quality.sd';

/** From a pixel height, which is what Jellyfin reports for a video stream. */
export function qualityFromHeight(height: number | undefined | null): QualityKey | null {
  if (!height || height <= 0) return null;
  // Bands rather than exact numbers: a 1920x804 scope film is 804 tall and is
  // still Full HD to everyone who watches it.
  if (height >= 1700) return 'quality.4k';
  if (height >= 900) return 'quality.fullHd';
  if (height >= 600) return 'quality.hd';
  return 'quality.sd';
}

/**
 * From any string a server dropped a resolution into.
 *
 * Covers "1080p", "WEBRip-1080p v1", "Bluray-2160p", "HDTV-720p" and the
 * DisplayTitle Jellyfin builds out of them.
 */
export function qualityFromLabel(label: string | undefined | null): QualityKey | null {
  if (!label) return null;
  const text = label.toLowerCase();
  if (/\b(2160p|4k|uhd)\b/.test(text)) return 'quality.4k';
  if (/\b1080[pi]\b/.test(text)) return 'quality.fullHd';
  if (/\b720[pi]\b/.test(text)) return 'quality.hd';
  if (/\b(480[pi]|576[pi]|sdtv|dvd)\b/.test(text)) return 'quality.sd';

  // Some servers only give the number.
  const bare = text.match(/\b(\d{3,4})\b/);
  return bare ? qualityFromHeight(Number(bare[1])) : null;
}
