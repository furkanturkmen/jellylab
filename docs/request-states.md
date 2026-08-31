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
| `importing` | fetched, not in the library | Sonarr `trackedDownloadState`, else push `onDisk` |
| `unreleased` | Radarr is deliberately not searching | Radarr `isAvailable` |
| `airing` `notAired` | the episode has not been broadcast | Sonarr `nextAiring` |
| `partial` | some of it is there | Jellyseerr `mediaStatus` |
| `searching` | approved, nothing found yet | fallback |
| `available` | done | Jellyseerr `mediaStatus` |

## "Processing" covers a download that already finished

Jellyseerr marks a request available from its own library scan, which runs
every five minutes and behind Jellyfin's. So there is a window — up to two
cycles — where Sonarr has imported every episode, the files are on disk, and
the request still says `Processing`.

The app used to render that as **Looking for it**, which is not a small
inaccuracy: it is the one state that means *nothing has been found*, shown
about something fully downloaded.

`push.onDisk` closes it. `airingSeries` already walks every series in Sonarr
for `nextAiring`; the same pass now records `episodeFileCount` against
`episodeCount` per season, and `unreleasedMovies` records Radarr's `hasFile`.
`onDiskComplete()` answers whether every season the *request* covers is
complete, and `requestState()` returns `importing` — "Finishing up" — instead
of guessing.

Deliberately all-or-nothing: a half-finished season is not finishing up, and
Jellyseerr calls that case `Partial`, which is handled earlier anyway.

**The case that proved it.** No Game No Life: Sonarr imported 12/12 at
`00:09:07Z`, the Jellyseerr sweep passed the Anime library at `00:10:00Z`, and
Jellyfin wrote the series item at `00:10:07Z` — seven seconds late. Jellyseerr
matches at series level, so it saw nothing, and the next sweep at `00:15Z`
picked it up. Six minutes of the card claiming to be looking for a season it
already had.

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

## Live figures come from qBittorrent, not the *arrs

Sonarr and Radarr refresh their queues from the torrent client **once a
minute**, so anything derived from them is up to a minute stale — over a
gigabyte at 20MB/s. Midsommar rendered `0% · < 1 MB/s` while qBittorrent had it
at 22.5% and 20MB/s, because Radarr had not looked again since grabbing it.

`jellylab-push` reads the client directly and the card prefers those numbers.
It is also the only place a **seed count** exists — the queue record has no
such field — and it carries both halves: connected over what the tracker
claims. Bin Roye sat at `0/14` for hours, which is the entire diagnosis of a
dead swarm and invisible from either number alone.

Entirely optional. With no qBittorrent credential the service returns nothing
extra and every caller falls back to the *arr figures, exactly as before.

Two things that bite:

- The session cookie is named **`QBT_SID_<port>`**, not `SID`. Matching the old
  name meant a login that succeeded with a 204 and a perfectly good cookie was
  reported as "no session cookie", which reads like bad credentials.
- A rejected login is a **200 carrying "Fails."**, not an error status, so an
  empty cookie is the only signal it genuinely failed.

Radarr's own percentage can also be a flat lie: it derives from `sizeleft`,
which is 0 while metadata is still resolving — so a torrent that has downloaded
nothing reads as **100%**. `livePercent` says 0.

## Speed is an average when there is no live figure

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
| `satisfied` | none acceptable **because we already have it** — success |
| `deadEnd` | releases exist, none may be grabbed. **Will not resolve on its own** |
| `grabbable` | something is acceptable now, so waiting is reasonable |

`satisfied` and `deadEnd` arrive identically — zero acceptable releases — and
are opposite situations. Pinocchio: Unstrung finished downloading, imported as
a 1.52GB Bluray-1080p, and the sheet announced *"48 found, none can be used —
this will not resolve on its own"*, because every remaining release was refused
for the entirely correct reason that the file on disk already met the cutoff.

Told apart on Radarr's own words: *existing file*, *in queue*, *already meets
cutoff*, *equal or higher*. An unrecognised reason still falls through to
`deadEnd`, because that is the louder answer and being wrong quietly is worse.

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

## Choosing a quality is not choosing a copy

`components/QualityPicker.tsx` sets which profile a title uses. A title is one
object in Radarr or Sonarr holding exactly one profile, so this changes what it
*seeks* — it never produces a second copy, and an upgrade replaces the file
rather than adding one. The sheet says so plainly, because that is the fear the
control invites.

Rendered only where there is a real choice: an account without Seerr's
advanced-request permission gets no profiles back, and one profile is not a
decision. The default is sent as **no profile id at all**, so a request that
wants the server default keeps working if that default is ever changed.

The five it offers are described in `docs/release-rules.md` in the homelab
repo; the app reads them live from Jellyseerr rather than hardcoding a list.

## Deleting a request has to cancel it too

Jellyseerr's `DELETE /request/:id` removes the request row and nothing else.
Radarr and Sonarr are never told, so they finish the download and import it —
and the title arrives in the library with no request anywhere explaining why it
was fetched.

Seen on 2026-08-31. Dragon Ball Z: Bio-Broly was requested from the phone at
`00:30:39`, auto-approved and handed to Radarr in the same second, and the
request was deleted two seconds later at `00:30:41`. Radarr grabbed it anyway
at `00:31:03` and imported 0.8G at `00:35:01`. Nine requests have been deleted
over this library's life, so Bio-Broly is unlikely to be the only one.

So `onDeleteRequest` removes the title downstream first, via Seerr's
`DELETE /media/:id/file`, which calls `removeMovie`/`removeSeries` on the *arr.
`deleteCancelsDownload()` decides when, and the rule is about what is on disk
rather than about the request:

| media status | what delete does |
| --- | --- |
| pending, processing, unknown | removes from Radarr/Sonarr, then deletes the request |
| available, partially available | deletes the request only |

Available is excluded because removing downstream passes `deleteFiles: true`.
A series can hold a pending season request beside seasons already downloaded,
and cancelling there would delete those files — so once anything has arrived,
forgetting the request is the whole of what "delete request" can safely mean.

The downstream call goes first on purpose. If it fails, the request stays and
the error is shown, because a deleted request over a live download is the exact
state this exists to prevent.

**What this still does not do.** Removing the movie from Radarr does not remove
the torrent from qBittorrent — Radarr drops its queue entry with the movie and
leaves the download client alone. So a cancelled title stops reaching the
library but can keep occupying disk. Cancelling properly needs a queue delete
with `removeFromClient=true`, which only `jellylab-push` can make. Deferred.

## The phone holds no credential

Everything above comes from `jellylab-push`, which keeps the Sonarr and Radarr
API keys on the server. The app asks a service rather than holding a key that
could rewrite the library — so `/candidates` is read-only, and there is
deliberately no "grab this one" button.

Changing a title's profile *after* the fact would need a write endpoint on
`jellylab-push` — narrow (set a profile, nothing else) but a real change in
what the phone can do. Deferred.
