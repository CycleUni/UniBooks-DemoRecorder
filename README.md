# UniBooks-DemoRecorder

Records scripted walkthroughs of a **running** UniBooks deployment and stitches
them into a showcase video.

It drives a real browser with Playwright, overlays a synthetic cursor so the
interaction reads as deliberate rather than instantaneous, and converts each
clip to mp4 with ffmpeg.

## This is not a test suite

There are no assertions here and nothing gates CI on it. It reproduces a
sequence of user actions for the camera; if a flow is broken, the recording
shows the breakage rather than failing. Do not read a successful run as
evidence that anything works.

## What it produces

Written to `DEMO_OUTPUT_DIR` (default `./demo_videos`):

| File | Flow |
|---|---|
| `01_login_and_sell.mp4` | Sign in, verify as a student, list a book |
| `02_search_chat_meetup_order.mp4` | Search, open a book, chat, arrange a meetup, order |
| `unibooks_master_showcase.mp4` | The two above concatenated |

`raw/` holds the webm files Playwright writes, which ffmpeg reads. Both
directories are gitignored — they are regenerated on every run.

## Prerequisites

- **The app running and reachable** at `DEMO_BASE_URL` (default
  `http://localhost:4200`), with its backend and CFEdgeChat up. The repository
  root of the UniBooks umbrella has a `docker-compose.yml` that brings up the
  whole set.
- **ffmpeg** on `PATH`, or `FFMPEG_BIN` pointing at it.
- **A verified demo account** already present in the target database, matching
  `DEMO_EMAIL` / `DEMO_PASSWORD`. The sell flow cannot run without student
  verification.

## Running it

```bash
npm install
cp .env.example .env      # optional; every key has a fallback
npm run record
```

Environment variables are read from the process environment. To load a `.env`
file, run it as `node --env-file-if-exists=.env record.js`.

## Cleanup between runs

Each recording creates a listing, a conversation and an order. Left in place,
the next run's video shows the leftovers. Set `UNIBOOKS_BE_DIR` to a
UniBooks-BE checkout and the script deletes them through `manage.py shell`
before recording.

Unset, the cleanup is **skipped with a warning** rather than guessed at — this
repository does not sit beside the backend, and a wrong path would report a
cleanup that did nothing.

## Throttling

The recording signs in and posts repeatedly, which the backend rate-limits.
Run the backend with `RELAX_THROTTLES=1` if a recording trips the limits;
never set that in production.
