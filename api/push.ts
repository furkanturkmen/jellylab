/**
 * Talks to jellylab-push on the homelab.
 *
 * Deliberately separate from the Jellyfin and Seerr clients: it is a different
 * service on a different port, and it stays usable when those two are
 * unreachable.
 *
 * It used to also register this device for native push. That is gone -
 * `aps-environment` is only issued to a paid Apple Developer account and this
 * build strips it (see plugins/withoutPushEntitlement.js), so notifications
 * are delivered by the ntfy app instead. What remains is the one thing the
 * service answers that Jellyfin cannot.
 */

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

/** The port jellylab-push listens on, alongside Jellyfin on the same host. */
const PUSH_PORT = 8099;

/**
 * Where to find jellylab-push, without anyone having to say.
 *
 * It runs on the same machine as Jellyfin and publishes its own port, so the
 * address is the Jellyfin one with the port swapped - true whether that is an
 * IP on the LAN, a NetBird address, or a hostname, since the hostname resolves
 * to the same host either way.
 *
 * There is a `pushUrl` preference and it still wins, for the case where the
 * service lives somewhere else. But it had no way of being set: nothing in the
 * app ever wrote it, so it stayed empty and every feature behind it - the
 * storage readout included - quietly did nothing. Deriving it means the
 * default case needs no configuring at all.
 */
export function resolveUrl(configured: string, jellyfinUrl: string): string {
  if (configured.trim()) return base(configured.trim());
  if (!jellyfinUrl.trim()) return '';
  try {
    const u = new URL(jellyfinUrl);
    u.port = String(PUSH_PORT);
    u.pathname = '';
    return base(u.toString());
  } catch {
    return '';
  }
}

export async function health(url: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${base(url)}/health`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

export type StorageInfo = {
  /** bytes */
  total: number;
  free: number;
  used: number;
  /** the path measured, as the server sees it */
  path: string;
};

/**
 * Free space on the drive holding the library.
 *
 * Served by jellylab-push rather than Jellyfin, because Jellyfin has no API
 * for it - it reports what is in the library, never what is left to put there.
 * That service already runs on the host with the media mount visible, so one
 * statfs there answers it.
 */
export async function storage(url: string): Promise<StorageInfo> {
  const res = await fetch(`${base(url)}/storage`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

/** One title being fetched, as the *arr queues describe it. */
export type DownloadProgress = {
  /** bytes */
  size: number;
  sizeLeft: number;
  /** 0..1, or null when the client has not reported a size yet */
  percent: number | null;
  /** Sonarr's tracked state: downloading, importBlocked, and so on */
  status: string | null;
  /** Sonarr knows this; a percentage cannot say it */
  stalled: boolean;
  title: string | null;
  /** when it was added to the queue, ISO */
  added?: string | null;
  /** Sonarr's own ETA, "HH:MM:SS" */
  timeLeft?: string | null;
  indexer?: string | null;
  client?: string | null;
  /** what was chosen: "WEBRip-1080p", "HDTV-1080p" */
  quality?: string | null;
  /**
   * The custom format score of the release being fetched.
   *
   * Worth showing. A release carrying PROPER in its title outranks everything
   * on revision before any score is read, so a negative score here means the
   * ranking picked something the quality profile actively did not want.
   */
  score?: number | null;
  languages?: string[];
  /**
   * Sonarr's own words for why it is stuck - "The download is stalled with no
   * connections". This is a seed count expressed as a symptom, and unlike a
   * seed count it costs no second credential to read.
   */
  error?: string | null;
  /*
   * Straight from qBittorrent, when jellylab-push has a password for it.
   *
   * Sonarr and Radarr refresh their queues from the client once a minute, so
   * everything above is up to a minute stale - over a gigabyte at 20MB/s. A
   * download read 0% and "< 1 MB/s" here while qBittorrent had it at 22.5%
   * and 20MB/s, because Radarr had not looked again since grabbing it.
   *
   * All optional: the service works without a qBittorrent credential and the
   * screen has to render either way.
   */
  /** 0..1, live */
  livePercent?: number | null;
  /** bytes per second, live */
  liveSpeed?: number | null;
  /** peers we are actually connected to */
  seeders?: number | null;
  /** what the tracker claims exists - the gap tells you a swarm is dead */
  seedersTotal?: number | null;
  peers?: number | null;
  /** downloading | stalledDL | metaDL | uploading | ... */
  clientState?: string | null;
  /** seconds remaining, qBittorrent's own estimate */
  eta?: number | null;
};

/** A film Radarr is deliberately not searching for yet. */
export type Unreleased = {
  /** announced | inCinemas | released | deleted */
  status: string | null;
  inCinemas: string | null;
  digitalRelease: string | null;
  physicalRelease: string | null;
};

/** A season with episodes still to come. */
export type Airing = {
  /** continuing | upcoming | ended */
  status: string | null;
  /** keyed by season number */
  seasons: Record<string, { aired: number; total: number; nextAiring: string }>;
};

/**
 * What a real search said about a title that has not arrived, swept in the
 * background rather than run when a card renders.
 *
 * The counts, not a conclusion: the same rejection set a live check returns,
 * so `lib/candidates` interprets both with one tested function.
 */
export type SweptVerdict = {
  found: number;
  accepted: number;
  rejections: Record<string, number>;
  /** epoch millis of the sweep */
  at: number;
};

export type Downloads = {
  /** keyed by TMDB id, which is what Jellyseerr keys a request on */
  tv: Record<string, DownloadProgress>;
  movies: Record<string, DownloadProgress>;
  /**
   * Films that have not reached their minimum availability.
   *
   * Radarr will not search for these and is right not to - a film still in
   * cinemas has nothing to find. Without this the app says it is looking for
   * something nothing is looking for.
   */
  unreleased?: Record<string, Unreleased>;
  /**
   * Series with seasons still to air, keyed by TMDB id.
   *
   * The television counterpart of `unreleased`: nothing is looking for an
   * episode that has not been broadcast, and saying so beats a search that
   * appears to be failing.
   */
  airing?: Record<string, Airing>;
  /**
   * Swept search outcomes, keyed by TMDB id.
   *
   * Present only for titles that are monitored, missing, and not currently
   * downloading - the question is meaningless otherwise. A title absent from
   * here has not been swept yet, which is different from one that was swept
   * and found nothing.
   */
  verdicts?: Record<string, SweptVerdict>;
  /** named failures, when one of the two services could not be read */
  errors?: Record<string, string>;
};

/**
 * What is actually downloading.
 *
 * Jellyseerr reports this too, and gets it wrong: it asks Sonarr for its queue
 * without raising the page size, so it sees the first twenty rows. Sonarr
 * queues one row per *episode*, so a 23-episode season pack fills that page by
 * itself and everything behind it looks idle - including whichever download is
 * actually moving, while a stalled one sits at the top holding the bar.
 *
 * jellylab-push pages through the whole queue instead. The API keys stay on
 * the server: this app asks a service rather than holding a credential that
 * could rewrite the library.
 */
export async function downloads(url: string): Promise<Downloads> {
  const res = await fetch(`${base(url)}/downloads`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

/** One release that could be grabbed, as the indexers describe it. */
export type Release = {
  title: string | null;
  quality: string | null;
  /** a PROPER or REPACK - the flag that wins a ranking, and the one forged */
  proper: boolean;
  score: number;
  seeders: number | null;
  leechers: number | null;
  /** bytes */
  size: number | null;
  indexer: string | null;
  languages: string[];
  age: number | null;
};

export type Candidates = {
  /** false when the *arr has never heard of it, which is its own answer */
  tracked: boolean;
  title?: string | null;
  /** how many releases the indexers returned */
  found: number;
  /** how many of those the quality profile would accept */
  accepted: number;
  /** the acceptable ones, best first. Empty is a diagnosis, not an error. */
  releases: Release[];
  /** why the rest were refused, commonest first */
  rejections: Record<string, number>;
};

/**
 * What could actually be grabbed for one title.
 *
 * A request that sits still reads as "searching" whether the problem is that
 * the wrong release keeps being chosen or that no permitted release exists at
 * all - and those need opposite fixes. Fall found 256 releases and accepted
 * 34, then repeatedly grabbed a PROPER that was malware. Bin Roye found seven,
 * accepted none, and would have searched forever: every one was a DVDRip and
 * the profile starts at 720p.
 *
 * Only acceptable releases come back, because a list of things that cannot be
 * grabbed is noise. When that list is empty, the count and the rejection
 * reasons are the whole answer.
 *
 * This runs a live search across every indexer on the server and takes tens of
 * seconds. Ask for it when someone taps, never on a poll.
 */
export async function candidates(
  url: string,
  tmdbId: number | string,
  type: 'movie' | 'tv',
  season?: number,
  signal?: AbortSignal,
): Promise<Candidates> {
  const q = new URLSearchParams({ tmdbId: String(tmdbId), type });
  if (type === 'tv' && season != null) q.set('season', String(season));
  const res = await fetch(`${base(url)}/candidates?${q}`, { signal });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

/**
 * Stop, or resume, Sonarr or Radarr looking for a title.
 *
 * The one write this service does, and the smallest one that makes rejecting
 * mean anything. Declining in Jellyseerr closes the request and nothing else:
 * Sonarr kept all ten episodes of a show with no releases anywhere monitored
 * and went on querying eight indexers for it every thirty minutes. The red
 * pill said stopped and nothing had.
 *
 * It sets `monitored` and touches nothing else - it cannot grab, delete or
 * blocklist - and every call is undone by the opposite call, which is what
 * un-rejecting does.
 *
 * Television needs the season: a request is filed per season, and unmonitoring
 * the whole series would stop searches for seasons nobody rejected.
 */
export async function setMonitored(
  url: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  monitored: boolean,
  season?: number,
): Promise<void> {
  const res = await fetch(`${base(url)}/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmdbId, type: mediaType, monitored, season }),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
}
