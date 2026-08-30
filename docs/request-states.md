# Request states

What the Requests tab is allowed to say, and where each answer comes from.

## The rule

**One pill, saying the most specific true thing.**

It used to be two — the request's state and the media's — deduplicated. In
practice that read `Approved · Processing` on nearly every card. Approval is
automatic for the owner and near-automatic for a guest, so the word was
everywhere and carried no information; and `Processing` covered *no release
exists*, *downloading at 40MB/s*, and *downloaded but Sonarr will not import
it*.

`lib/requests.ts` resolves exactly one state, ordered by what a person wants to
know: something that needs them, then what is happening now, then what has
settled.

| state | means | source |
|---|---|---|
| `pending` | waiting for a human to approve | Jellyseerr `status` |
| `declined` `failed` | needs a person | Jellyseerr `status` |
| `downloading` | moving | push queue, else Jellyseerr queue |
| `stalled` | in the queue and not moving | Sonarr `errorMessage` |
| `importing` | fetched, not in the library | Sonarr `trackedDownloadState` |
| `unreleased` | Radarr is deliberately not searching | Radarr `isAvailable` |
| `airing` `notAired` | the episode has not been broadcast | Sonarr `nextAiring` |
| `partial` | some of it is there | Jellyseerr `mediaStatus` |
| `searching` | approved, nothing found yet | fallback |
| `available` | done | Jellyseerr `mediaStatus` |

## Never report a percentage from Jellyseerr

Jellyseerr asks Sonarr for its queue without raising the page size, so it sees
the first twenty rows. Sonarr queues **one row per episode**, so a 23-episode
season pack fills that page by itself and everything behind it looks idle —
including whichever download is actually moving, while a stalled one sits at
the top holding the bar.

`jellylab-push` pages through the whole queue. Prefer it for anything about
downloading; fall back to Jellyseerr, which is right often enough.

## A stalled download says why, not how fast

Sonarr puts the reason in `errorMessage` — *"The download is stalled with no
connections"*. While it is stalled, the size and the average speed both
describe something that is not happening, so the sentence takes the line.

That message is also the seed count expressed as a symptom, which matters
because the queue record has no `seeders` field and getting one would mean a
second credential for qBittorrent.

## Speed is an average, never a spot reading

`lib/download.ts` derives it from bytes done over time elapsed. A torrent
averaging 2MB/s over ten hours is a different situation from one that briefly
touched 20, and the average is the one worth knowing. Each piece is dropped
rather than faked when it cannot be known, so the line shortens instead of
lying.

## `searching` hides two opposite situations

This is the one that cost real time to diagnose.

```
Fall (2022)      256 releases found, 34 acceptable
                 → grabbed a PROPER that was an .exe, twice, and would forever

Bin Roye (2015)    7 releases found,  0 acceptable
                 → every one a DVDRip, profile starts at 720p, never resolves
```

Both rendered as `searching`. One needed the server's ranking fixed; the other
needed the quality profile changed. Nothing in the app could tell them apart.

`ReleaseCheck` asks `jellylab-push /candidates`, which runs a live interactive
search and returns what could actually be grabbed. `lib/candidates.ts` turns
that into a verdict:

| verdict | meaning |
|---|---|
| `untracked` | never added to Sonarr/Radarr — nobody is looking |
| `nothing` | the indexers returned nothing at all |
| `deadEnd` | releases exist, none may be grabbed. **Will not resolve on its own** |
| `grabbable` | something is acceptable now, so waiting is reasonable |

Rules for it:

- **Only acceptable releases are listed.** A list of things that cannot be
  grabbed is noise.
- **An empty list is the diagnosis, not a blank screen.** When nothing is
  acceptable, the count and the commonest rejection reason are the whole
  answer, so those always come back.
- **Rejection reasons are shown in Radarr's own words.** Translating them would
  mean tracking every string the \*arrs can emit, and getting it wrong silently.
- **Asked for by hand, never polled.** It sweeps every indexer and takes tens
  of seconds.
- **Offered only where it would change what you do** — `searching`, `stalled`,
  `importing`. Everywhere else the state already is the explanation.

## A PROPER that scores negative is worth flagging

`suspicious()` marks a release that is both a PROPER and scored below zero by
the quality profile. That exact combination beat 1813 seeders with 24 and
turned out to be an `.exe`, because Radarr sorts revision above custom-format
score. See `docs/release-rules.md` in the homelab repo, R0.

It is a flag on a row, not a safety check. The only real check opens the
torrent and looks inside, which happens on the server.

## The phone holds no credential

Everything above comes from `jellylab-push`, which keeps the Sonarr and Radarr
API keys on the server. The app asks a service rather than holding a key that
could rewrite the library — so `/candidates` is read-only, and there is
deliberately no "grab this one" button.
