# Downloads — plan

The Downloads tab has been a placeholder empty state since the tabs were
written. This is what filling it in actually involves, written before any code
so the shape can be argued with rather than discovered halfway.

## What it has to do

Watch something on a plane. That is the whole feature, and it sets every
requirement below:

- Pick an episode or a film and keep the file on the device.
- Play it with no server reachable at all.
- See what is stored, how much room it takes, and remove it.
- Send the resume position back to Jellyfin once the server is reachable again.

## What already exists

| piece | where | note |
|-------|-------|------|
| Direct file URL | `api/jellyfin.ts` → `streamUrl()` | `static=true`, so the server hands over the original file untouched — exactly what should be stored |
| External subtitles | `subtitleUrl()` | already used by both engines |
| Playback engines | `player/decide.ts` | decides AVPlayer vs VLC from container and codecs; a local file needs the same decision |
| Progress reporting | `app/item/[id].tsx` | start/progress/stopped, all of which assume a live server |
| The tab | `app/(tabs)/downloads.tsx` | 57 lines, an icon and two strings |

Nothing for the filesystem: `expo-file-system` is not a dependency yet.

## The parts to build

### 1. Storage

`expo-file-system`. One directory per item under the app's document directory,
so a partial download cannot be mistaken for a finished one:

```
downloads/
  <itemId>/
    media.mkv          the original file, container preserved
    meta.json          title, series, season, episode, duration, container
    poster.jpg         the artwork, because the tab must draw with no network
    subs/<lang>.vtt    external subtitles, fetched alongside
```

`meta.json` is what makes the tab work offline. Reading the file names is not
enough: the tab shows series and episode titles, and those live on the server.

### 2. A download store

`store/downloads.ts`, in the shape the other stores already use — a module with
a pub/sub listener list and a sync cache, like `store/servers.ts`. It owns:

- the queue and the state of each item: `queued | downloading | done | failed`
- bytes written and total, for progress
- `createDownloadResumable()` handles, so a download survives backgrounding
- eviction: delete a directory, update the cache, notify

State belongs in a store rather than the screen because the item screen needs it
too — its download button has to know whether this episode is already stored.

### 3. Which file to store

`streamUrl()` with `static=true`. Not the transcode URL: HLS arrives as hundreds
of segments plus a playlist, and reassembling that offline is a different and
much worse project. Storing the original also means `decidePlayback()` keeps
working unchanged — the same container and codecs, just a `file://` path.

The cost is honesty about size: a 4K remux is 60 GB and the phone should say so
before starting, not after.

### 4. Playing a local file

Both engines take a local path. `expo-video` accepts a `file://` URI, and VLC
takes a plain path. The item screen already branches on engine, so the change is
to its source selection: prefer a stored file when one exists, fall back to the
server otherwise. Subtitles come from `subs/` instead of the network.

Playback reporting has to become optional here — every call in that path assumes
a reachable server, and offline they will all fail. The queue in §5 is where
they go instead.

### 5. Reporting when the server comes back

An offline watch still moves the resume point, and Jellyfin only learns about it
later. A small outbox: append `{ itemId, positionTicks, at }` to a file, drain
it on the next successful request to the server, drop entries the server
rejects. Without this, watching on a plane means the resume point silently
rewinds when you land — the same class of bug as the VLC reporting one fixed in
598e650.

### 6. The tab itself

Three sections, in the order they matter: **downloading** with progress and a
cancel, **on this device** with size and a delete, and the existing empty state
when both are empty. Total size and free space at the top, which the profile
screen already knows how to ask for.

## Where this stands

Built:

1. `expo-file-system`, `store/downloads.ts`, one directory per item with a
   `meta.json` beside the media file.
2. A download button on the item screen for films and episodes. It asks first,
   with the size the server reports, and turns green once the file is here.
   Pressing it again offers to delete.
3. The tab: what is arriving with a progress bar and a cancel, what is stored
   with its size and a delete, failures kept rather than swept away, and the
   total across the top.
4. Playback prefers the stored file. The engine is chosen from the container
   the download wrote down rather than from `decidePlayback`, whose answer for
   an unplayable file is "ask the server to transcode" - and the server may be
   the thing that is missing.

5. Subtitles and the poster are stored beside the media, and the picker reads
   the stored copy first.
6. The item screen falls back to `meta.json` when the server cannot be reached,
   so a stored file is reachable with no network at all.
7. The resume point is written beside the media, and what the server missed
   waits in `store/outbox.ts` until a request to it succeeds.

What is left:

- Eviction, §6. Still needs a number, and the number should come from watching
  real use.
- A whole season in one go. Per-item is what exists.
- Playing straight from the Downloads tab rather than through the item screen.
  The tab links to the item screen, which now works offline, so this is
  convenience rather than capability.

## Order of work

1. `expo-file-system` + `store/downloads.ts` + a hardcoded download of one item.
   Proves the file lands, survives a restart, and plays locally.
2. Download button on the item screen, with size shown before it starts.
3. The tab: list, progress, delete.
4. Subtitles and poster alongside the media file.
5. The outbox for offline progress.
6. Eviction rules — a cap, or delete-after-watching, decided once the rest works.

## Open questions

- **Series or episodes?** Downloading a whole season is the obvious want and the
  obvious way to fill a phone. Probably per-episode first, with a "download next
  N" later.
- **What happens when the file is deleted server-side?** The local copy is still
  playable but the item may no longer resolve. The tab should survive that
  rather than error.
- **Does a download need to survive the app being killed?** Backgrounding, yes -
  `createDownloadResumable` handles it. A force-quit mid-download probably just
  restarts that file.
- **Storage cap.** No cap at all is a phone full of anime. A cap needs a number,
  and the number should come from watching real use rather than being guessed
  now.

## What this is not

Not a sync engine. Nothing here tries to keep a library mirrored, or to decide
what to download on your behalf. You pick a thing, it is stored, you delete it.
