export type Server = {
  id: string;
  name: string;
  jellyfinUrl: string;
  jellyseerrUrl: string;
};

export type JellyfinAuth = {
  serverId: string;
  userId: string;
  accessToken: string;
  userName: string;
  isAdmin?: boolean;
  primaryImageTag?: string;
};

export type JellyseerrAuth = {
  cookie: string;
  userId: number;
  email: string;
};

export type JellyfinItem = {
  Id: string;
  Name: string;
  Type: 'Movie' | 'Series' | 'Episode' | 'Season' | 'Audio' | 'MusicAlbum' | 'CollectionFolder' | string;
  ProductionYear?: number;
  Overview?: string;
  RunTimeTicks?: number;
  UserData?: {
    PlaybackPositionTicks: number;
    Played: boolean;
    /** ISO stamp of the last time this was watched - present when asked for. */
    LastPlayedDate?: string;
  };
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  /** Scraper ids - Tmdb, Imdb, Tvdb - present only when asked for in Fields. */
  ProviderIds?: Record<string, string>;
  SeriesId?: string;
  IndexNumber?: number;
  SeriesName?: string;
  Genres?: string[];
  /** "Continuing" or "Ended" for a series. */
  Status?: string;
  EndDate?: string;
  /** Seasons, for a series. */
  ChildCount?: number;
  ParentIndexNumber?: number;
};

export type JellyfinView = {
  Id: string;
  Name: string;
  CollectionType?: 'movies' | 'tvshows' | 'music' | string;
};

export type JellyseerrSearchResult = {
  id: number;
  mediaType: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  posterPath?: string;
  overview?: string;
  releaseDate?: string;
  firstAirDate?: string;
  adult?: boolean;
  /** TMDB genre ids; 16 is Animation. */
  genreIds?: number[];
  originalLanguage?: string;
  originalName?: string;
  mediaInfo?: {
    status: number;
    requests?: { id: number; status: number }[];
  };
};

export type JellyseerrRequest = {
  id: number;
  status: number;
  createdAt: string;
  media: {
    id: number;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    status: number;
    /** live queue entries from Sonarr/Radarr, which read them from qBittorrent */
    downloadStatus?: {
      size?: number;
      sizeLeft?: number;
      timeLeft?: string;
      status?: string;
      episode?: { seasonNumber: number; episodeNumber: number };
    }[];
  };
  requestedBy: { id: number; displayName: string };
  /** which seasons this request covers; absent or empty for movies */
  seasons?: { seasonNumber: number }[];
};

export const REQUEST_STATUS: Record<number, string> = {
  1: 'Pending',
  2: 'Approved',
  3: 'Declined',
};

export const MEDIA_STATUS: Record<number, string> = {
  1: 'Unknown',
  2: 'Pending',
  3: 'Processing',
  4: 'Partially Available',
  5: 'Available',
};
