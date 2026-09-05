# UniBooks-DemoRecorder

Records scripted walkthroughs of a **running** UniBooks deployment and cuts
them, with title cards, into a showcase film — edited to a music bed.

It drives a real browser with Playwright, overlays a synthetic cursor so the
interaction reads as deliberate rather than instantaneous, rasterises a set of
HTML title cards, and assembles the lot with ffmpeg.

## This is not a test suite

There are no assertions here and nothing gates CI on it. It reproduces a
sequence of user actions for the camera; if a flow is broken, the recording
shows the breakage rather than failing. Do not read a successful run as
evidence that anything works.

## What it produces

Written to `DEMO_OUTPUT_DIR` (default `./demo_videos`):

| Path | What it is |
|---|---|
| `unibooks_showcase.mp4` | The film. 1920×1080, 30fps, 2:43, with the music bed |
| `scenes/*.mp4` + `scenes.json` | One take per scene, where each performance starts, and the boxes it asked to highlight |
| `cards/*.png` | The title cards, rasterised |
| `overlays/*.png` | Corner badges and highlight boxes, transparent |
| `raw/`, `work/` | Playwright's webm output and per-clip intermediates |

Everything under `demo_videos/` is gitignored and regenerated on every run.

## The three moving parts

**`timeline.js` is the edit.** One list of what appears, in what order, for how
long, and how each piece enters. The recorder reads it to know what to shoot;
the builder reads it to know how to assemble. Change the film here.

Lengths there are in **bars**, not seconds — see *Cut to the music* below.

**`record.js` shoots the takes.** One browser context per scene, so a scene can
be re-shot alone and each can be paced separately. Every scene runs a fast,
ugly setup phase, calls `mark()`, then performs; the offset `mark()` records is
trimmed off at the edit, so putting the app into position never reaches the
cut.

**`render-overlays.js` draws what goes on top.** A corner badge for every scene
that declares one, and a box-and-caption for every `highlight()` the recorder
made. It runs *after* recording, not with the cards: a highlight is positioned
from the box the browser actually laid out, and coordinates written down in
advance are how a box ends up framing empty space.

**`build-video.js` cuts.** Normalises every entry into a clip of exactly its
slot length — stills held with a slow push, takes trimmed past their setup and
sped up to fit — composites the overlays onto it, then joins everything with a
single xfade chain.

The speed applied to a take is measured, not chosen: footage length ÷ slot
length. `speedHint` in the timeline only tells the scene roughly how much to
shoot, and the builder warns when the two disagree far enough that the take
wants re-shooting rather than re-timing.

## Badges and highlights

Two things are drawn over the footage, both declared close to where they are
decided.

A **badge** is a corner label naming whose screen this is, set per scene in
`timeline.js`. The film follows one account through two opposite roles and then
a conversation with a second person; without a standing marker, which of them
you are watching is left to be inferred from whichever page happens to be open.

A **highlight** is a box and a caption around the one control a shot is about.
Scenes ask for them by calling `highlight(selector, label)`, which rests the
cursor there, measures the element and records the moment. The last act needs
them: an email binding, a waitlist subscription, a theme and language switch
are each a small piece of a full page, and seven seconds is not long enough to
find them unaided.

Captions get a floor on their time on screen (`MIN_CAPTION_SECONDS`). A hold is
divided by the speed factor along with everything else, so three seconds of
resting becomes two seconds of reading at 1.5x — not enough for a sentence.

## Cut to the music

The film is edited to a 115 BPM track with a strict eight-bar phrase structure,
so `timeline.js` counts in bars and derives the seconds. Every cut lands on a
bar line by construction rather than by being nudged onto one afterwards, and
three of the bar counts are set by the track itself:

| Bar | The track | The film |
|---|---|---|
| 1 | riser ends, band enters | under the opening card |
| 33 | drops to a quiet passage | the buyer act opens |
| 41 | comes back | cut to the book's real seller and price |
| 73 | begins winding down | the technical card |
| 78 | silence | end |

The quiet passage is the only place a shot gets to breathe: the search runs
through it at 1.02x, near real time. That is a consequence of the structure
rather than a decision made twice.

An earlier pass measured lengths in seconds, and 17 of the 23 cuts landed
0.3–1.0s off the beat. Against a track this regular that reads worse than
being nowhere near it.

`DEMO_MUSIC` points at the track; it is **not** in version control, because
this repository has a licence to use it, not to redistribute it. Without it
the film is cut silent and `build-video.js` says so. Replacing it with a
different track means re-deciding the bar counts, not just changing the path.

## The cards are HTML

`cards/*.html`, rasterised by `render-cards.js`. Two reasons they are not drawn
by ffmpeg: the local ffmpeg is built without libfreetype, so `drawtext` does
not exist — and, more to the point, writing them as web pages lets them inherit
the product's own design tokens. Same deep green, same kraft amber, same Noto
Serif TC, same ruled book-board ground as the app they introduce. Colours are
copied from `UniBooks-FE/src/styles.css`; if that palette changes, change them
here too.

Nothing in a card animates. Movement is added at the edit, so a card and a
screen recording can be crossfaded as two clips of known length.

## Prerequisites

- **The app running and reachable** at `DEMO_BASE_URL` (default
  `http://localhost:4200`), with its backend and CFEdgeChat up.
- **ffmpeg and ffprobe** on `PATH`, or `FFMPEG_BIN` / `FFPROBE_BIN` pointing at
  them.
- **Two accounts in the target database**: `DEMO_EMAIL`, verified in
  `DEMO_REGION` (the sell and chat flows both refuse to run otherwise), and
  `DEMO_SELLER_EMAIL`, who must be the seller of the listing
  `DEMO_TARGET_ISBN` resolves to.
- **Seeded catalogue data** matching the defaults in `.env.example` — the book
  that gets listed, the one that gets bought, and one nobody is selling.

## Running it

```bash
npm install
cp .env.example .env      # every key has a fallback; UNIBOOKS_BE_DIR is the one worth setting
npm run film              # cards, takes, overlays, then the cut
```

Each step also runs alone, and usually should:

```bash
npm run cards                        # re-rasterise the title cards
npm run record                       # clean up, then shoot all thirteen scenes
npm run record -- s08_chat           # re-shoot one, leaving the others alone
npm run record -- --clean s08_chat   # ...and clear the data the last take left
npm run overlays                     # re-draw badges and highlights
npm run build                        # re-cut from whatever is in scenes/
```

Re-shooting a scene invalidates its highlights, so `overlays` has to run again
before `build` — otherwise the box is drawn where the element used to be.

## Before a shoot: hide the load-test fixture

The development database carries a performance fixture — one book, "Sample Book
1", a few thousand listings, nearly all owned by the demo account, illustrated
with a stock photograph. On the home page it renders as "660 本上架中" for what
is really one person. UniBooks-BE's own `seed_homepage_demo.py` calls out why
that shape reads as fake data; on camera it is the first tile a viewer sees.

```bash
npm run stage -- hide      # sets those listings to `removed`, backing up their statuses
npm run stage -- restore   # puts every one back exactly as it was
```

Nothing is deleted, and the restore reads the backup rather than guessing: the
fixture's rows are spread across active, reserved and sold, so a restore that
flipped everything to `active` would quietly rewrite thousands of them.

## Cleanup between runs

Each recording creates a listing, a conversation, an order and a waitlist
subscription. Left in place, the next run's video shows the leftovers —
duplicate listings on the shelf, the same question asked four times in one
thread, an already-pressed notify button. Set `UNIBOOKS_BE_DIR` to a
UniBooks-BE checkout and a full run deletes them through `manage.py shell`
before recording.

Unset, the cleanup is **skipped with a warning** rather than guessed at — this
repository does not sit beside the backend, and a wrong path would report a
cleanup that did nothing.

## Throttling

The recording signs in and posts repeatedly, which the backend rate-limits.
Sign-in state is captured once per account and reused across scenes to keep
that down, but if a run still trips the limits, start the backend with
`RELAX_THROTTLES=1`. Never set that in production.

## Two app behaviours the recorder works around

Both are races in the app, not in this tool, and both are handled here so the
camera does not catch them. Worth knowing about if you touch either flow.

**Verification can render as unverified.** `sell.ts` and `book.ts` both decide
with `authStore.isVerifiedIn(regionService.region())`, and `isUserVerifiedIn()`
returns false for a null region. When the `/auth/me` response wins the race
against the region resolving, a verified account is told it is not — the sell
wizard shows a red banner and refuses the final submit, and "contact seller"
silently does nothing. `assertVerified()` settles, checks, and reloads once.

**A new record can lose the race against the view listing it.** Arriving at
`/messages?chat=<id>` just after creating the conversation, the inbox request
can come back without it, and `messages.html` renders the empty-inbox state
instead of the thread. `waitOrReload()` reloads once rather than waiting longer
on a view that has already decided it has nothing to show.

Also note that `waitForURL` is not used anywhere: every route change in this app
is an Angular pushState, which does not re-fire `load`, so it times out on
navigations that already happened. Arrival is confirmed by the DOM instead.
